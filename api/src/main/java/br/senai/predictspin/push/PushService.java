package br.senai.predictspin.push;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import br.senai.predictspin.alarme.Nivel;
import br.senai.predictspin.alerta.AlertaAlterado;
import br.senai.predictspin.alerta.EstadoAlerta;
import br.senai.predictspin.alerta.dto.AlertaResposta;
import br.senai.predictspin.ordemservico.OrdemServicoAlterada;
import br.senai.predictspin.ordemservico.dto.OrdemServicoResposta;
import br.senai.predictspin.push.dto.AparelhoResposta;
import br.senai.predictspin.push.dto.PushDiagnosticoResposta;
import jakarta.annotation.PreDestroy;

/**
 * Push de alarme (ISA-18.2: só o que exige ação, nunca por janela):
 * <ul>
 *   <li>alerta de máquina que ENTRA em ALARME (abrindo já em alarme ou piorando para alarme): todos os usuários
 *       ativos com aparelho; uma vez por alerta, mesmo que volte a ATENÇÃO e entre em ALARME de novo;</li>
 *   <li>OS aberta: ADMIN e TECNICO (segundo push de propósito: escalona para quem conserta);</li>
 *   <li>alerta de instrumento: ADMIN e TECNICO, dizendo que é problema do sensor, não da máquina.</li>
 * </ul>
 * ATENÇÃO, normalização, reconhecimento, alerta suprimido e o que nasce em ensaio de condição não geram push.
 * No máximo um push por ponto e tipo a cada ps.push.intervalo-min, contra alarme que normaliza e reabre em
 * ciclo. O envio nunca atrasa nem derruba a avaliação: o ouvinte roda depois do commit e só põe na fila de uma
 * thread própria; falha vira log e contador.
 */
@Service
public class PushService {

    static final String CANAL_ANDROID = "alarmes";
    static final List<String> TODOS = List.of("ADMIN", "TECNICO", "OPERADOR");
    static final List<String> QUEM_CONSERTA = List.of("ADMIN", "TECNICO");

    private static final Logger LOG = LoggerFactory.getLogger(PushService.class);
    private static final int CORPO_MAX = 178;

    private final PropriedadesPush prop;
    private final PushSql sql;
    private final ClienteExpo expo;
    private final TransactionTemplate transacao;
    private final Clock relogio;
    private final ThreadPoolExecutor fila;
    private final Instant desde;

    private final AtomicLong enviados = new AtomicLong();
    private final AtomicLong falhos = new AtomicLong();
    private final AtomicLong desativados = new AtomicLong();
    private final AtomicLong segurados = new AtomicLong();
    private final AtomicLong semDestinatario = new AtomicLong();
    private final AtomicLong descartados = new AtomicLong();
    private final AtomicInteger pendentes = new AtomicInteger();

    public PushService(PropriedadesPush prop, PushSql sql, ClienteExpo expo, TransactionTemplate transacao,
                       Clock relogio) {
        this.prop = prop;
        this.sql = sql;
        this.expo = expo;
        this.transacao = transacao;
        this.relogio = relogio;
        this.desde = relogio.instant();
        this.fila = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(prop.filaMax()),
                r -> {
                    Thread t = new Thread(r, "push");
                    t.setDaemon(true);
                    return t;
                }, new ThreadPoolExecutor.AbortPolicy());
    }

    @PreDestroy
    void parar() {
        fila.shutdownNow();
    }

    // ------------------------------------------------------------------ gatilhos (depois do commit)

    /** O que gera push e o que não gera, a partir do evento do alerta. */
    static Optional<Gatilho> gatilho(String acao, AlertaResposta a) {
        if (a.duranteEnsaioDeCondicao() || a.estado() == EstadoAlerta.SUPRIMIDO) {
            return Optional.empty();
        }
        if ("instrumento".equals(a.tipo())) {
            return "abriu".equals(acao) ? Optional.of(instrumento(a)) : Optional.empty();
        }
        boolean entrouEmAlarme = ("abriu".equals(acao) || "piorou".equals(acao)) && a.nivel() == Nivel.ALARME;
        return entrouEmAlarme ? Optional.of(alarme(a)) : Optional.empty();
    }

    static Optional<Gatilho> gatilho(String acao, OrdemServicoResposta os) {
        return "aberta".equals(acao) ? Optional.of(ordem(os)) : Optional.empty();
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void aoAlterarAlerta(AlertaAlterado evento) {
        if (prop.habilitado()) {
            gatilho(evento.evento().acao(), evento.evento().alerta()).ifPresent(this::enfileirar);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void aoAlterarOrdemServico(OrdemServicoAlterada evento) {
        if (prop.habilitado()) {
            gatilho(evento.evento().acao(), evento.evento().ordem()).ifPresent(this::enfileirar);
        }
    }

    private void enfileirar(Gatilho g) {
        pendentes.incrementAndGet();
        try {
            fila.execute(() -> {
                try {
                    processar(g);
                } finally {
                    pendentes.decrementAndGet();
                }
            });
        } catch (RejectedExecutionException e) {
            pendentes.decrementAndGet();
            descartados.incrementAndGet();
            LOG.warn("Push: fila cheia ({}), envio de {} descartado", prop.filaMax(), g.tipo());
        }
    }

    // ------------------------------------------------------------------ decisão e envio (thread do push)

    void processar(Gatilho g) {
        try {
            Instant agora = relogio.instant();
            Optional<PushSql.Decisao> decisao = transacao.execute(s -> sql.decidir(g.tipo(), g.alertaId(), g.osId(),
                    g.simulado(), prop.intervaloMin(), agora));
            if (decisao == null || decisao.isEmpty()) {
                return; // a mesma ocorrência já teve decisão: nunca um segundo push
            }
            if (!decisao.get().enviar()) {
                segurados.incrementAndGet();
                return;
            }
            List<String> tokens = sql.tokens(g.papeis());
            if (tokens.isEmpty()) {
                semDestinatario.incrementAndGet();
                sql.concluir(decisao.get().id(), "sem_destinatario", 0);
                return;
            }
            int aceitas = enviarEmLotes(g, tokens, agora);
            sql.concluir(decisao.get().id(), aceitas > 0 ? "enviado" : "falhou", tokens.size());
        } catch (RuntimeException e) {
            falhos.incrementAndGet();
            LOG.warn("Push: erro ao processar {}: {}", g.tipo(), e.toString());
        }
    }

    private int enviarEmLotes(Gatilho g, List<String> tokens, Instant agora) {
        int aceitas = 0;
        int lote = Math.max(1, Math.min(prop.lote(), 100));
        for (int i = 0; i < tokens.size(); i += lote) {
            List<String> parte = tokens.subList(i, Math.min(tokens.size(), i + lote));
            List<ClienteExpo.Mensagem> mensagens = parte.stream()
                    .map(t -> new ClienteExpo.Mensagem(t, g.titulo(), g.corpo(), g.dados())).toList();
            List<ClienteExpo.Resultado> resultados = expo.enviar(mensagens);
            List<String> usados = new ArrayList<>();
            for (int j = 0; j < parte.size(); j++) {
                switch (resultados.get(j)) {
                    case ACEITA -> {
                        aceitas++;
                        enviados.incrementAndGet();
                        usados.add(parte.get(j));
                    }
                    case NAO_REGISTRADO -> {
                        falhos.incrementAndGet();
                        desativados.addAndGet(sql.desativar(parte.get(j)));
                    }
                    case RECUSADA -> falhos.incrementAndGet();
                }
            }
            sql.marcarUso(usados, agora);
        }
        return aceitas;
    }

    // ------------------------------------------------------------------ conteúdo (sem dado sensível)

    /** O que enviar e para quem; dados abrem o alarme ou a OS certa no app. */
    record Gatilho(String tipo, Long alertaId, Long osId, boolean simulado, List<String> papeis, String titulo,
                   String corpo, Map<String, Object> dados) {
    }

    private static Gatilho alarme(AlertaResposta a) {
        String motivo = a.explicacao() == null ? "vibração acima do limite de alarme" : primeiraParte(a.explicacao());
        String corpo = (a.componente() == null ? "" : maiuscula(a.componente()) + ": ") + motivo + ". Toque para ver.";
        return new Gatilho("alarme", a.id(), null, a.simulado(), TODOS,
                titulo("ALARME", a.maquina(), a.ponto(), a.simulado()), curto(corpo),
                dados("alarme", "alerta_id", a.id(), a.maquinaId(), a.simulado()));
    }

    private static Gatilho instrumento(AlertaResposta a) {
        String motivo = a.explicacao() == null ? "" : primeiraParte(a.explicacao().replaceFirst("^Sensor \\w+: ", ""));
        String corpo = "Problema no sensor, não na máquina" + (motivo.isEmpty() ? "" : ": " + motivo)
                + ". Toque para ver.";
        return new Gatilho("instrumento", a.id(), null, a.simulado(), QUEM_CONSERTA,
                titulo("SENSOR", a.maquina(), a.ponto(), a.simulado()), curto(corpo),
                dados("alerta", "alerta_id", a.id(), a.maquinaId(), a.simulado()));
    }

    private static Gatilho ordem(OrdemServicoResposta os) {
        String corpo = os.numero() + (os.componente() == null ? "" : " · " + os.componente())
                + ". Para quem conserta. Toque para ver.";
        return new Gatilho("os", null, os.id(), os.simulado(), QUEM_CONSERTA,
                titulo("OS ABERTA", os.maquina(), os.ponto(), os.simulado()), curto(corpo),
                dados("os", "os_id", os.id(), os.maquinaId(), os.simulado()));
    }

    static String titulo(String o, String maquina, String ponto, boolean simulado) {
        return (simulado ? "SIMULADO · " : "") + o + " · " + maquina + " · ponto " + ponto;
    }

    private static Map<String, Object> dados(String tipo, String chave, Long id, Long maquinaId, boolean simulado) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("tipo", tipo);
        d.put(chave, id);
        d.put("maquina_id", maquinaId);
        d.put("simulado", simulado);
        return d;
    }

    /** "A·3X 1,7σ acima do típico; A·RMS ..." → "A·3X 1,7σ acima do típico". */
    static String primeiraParte(String texto) {
        String t = texto.split(";", 2)[0].trim();
        return t.endsWith(".") ? t.substring(0, t.length() - 1) : t;
    }

    private static String maiuscula(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    static String curto(String s) {
        return s.length() <= CORPO_MAX ? s : s.substring(0, CORPO_MAX - 1) + "…";
    }

    /** Espera a fila do push esvaziar (testes e encerramento ordenado). */
    boolean aguardarOcioso(Duration limite) throws InterruptedException {
        long fim = System.nanoTime() + limite.toNanos();
        while (pendentes.get() > 0) {
            if (System.nanoTime() > fim) {
                return false;
            }
            Thread.sleep(10);
        }
        return true;
    }

    /** Os contadores valem desde a subida da API; os testes zeram entre um caso e outro. */
    void zerarContadores() {
        for (AtomicLong c : List.of(enviados, falhos, desativados, segurados, semDestinatario, descartados)) {
            c.set(0);
        }
    }

    // ------------------------------------------------------------------ aparelhos e diagnóstico

    public AparelhoResposta registrar(long usuarioId, String token, String plataforma) {
        return transacao.execute(s -> {
            AparelhoResposta r = sql.registrar(usuarioId, token, plataforma, relogio.instant(), prop.habilitado());
            sql.limitarAparelhos(usuarioId, prop.maxAparelhos());
            return r;
        });
    }

    public void remover(long usuarioId, String token) {
        sql.remover(usuarioId, token);
    }

    public PushDiagnosticoResposta diagnostico() {
        return new PushDiagnosticoResposta(prop.habilitado(), desde, enviados.get(), falhos.get(), desativados.get(),
                segurados.get(), semDestinatario.get(), descartados.get(), sql.aparelhosAtivos(), prop.intervaloMin());
    }
}

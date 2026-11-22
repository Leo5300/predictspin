package br.senai.predictspin.eventos;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongFunction;
import java.util.function.Predicate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.SmartLifecycle;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.comum.LimiteDeConexoesException;
import br.senai.predictspin.eventos.dto.EnsaioEvento;
import br.senai.predictspin.eventos.dto.RecuperacaoEvento;
import br.senai.predictspin.maquina.dto.ModoRapidoResposta;
import br.senai.predictspin.telemetria.JanelaService;

/**
 * Difusão dos eventos ao vivo (SSE) para o painel, em memória. Vale para uma instância só da API:
 * com mais de uma, cada cliente só veria os eventos da instância em que está conectado.
 *
 * <p>Quem publica nunca espera cliente: a ingestão só coloca o pedido numa fila limitada, atendida
 * por uma thread própria ("eventos-difusao"), que lê a janela do banco, serializa uma vez e oferece
 * a mensagem à fila de cada assinante. Cada assinante tem a própria thread de envio; se a fila dele
 * enche (cliente lento) ou a escrita falha (cliente caído), ele é descartado. Sem evento por um
 * intervalo, a thread de envio manda um comentário de batimento, para o proxy não fechar a conexão.
 *
 * <p>Janela antiga (reenvio da fila do dispositivo depois de uma queda de rede) não vira evento
 * "janela": as que chegam num intervalo viram um evento "recuperacao" só, com o período e a
 * quantidade. Sem isso, milhares de janelas reenviadas em minutos encheriam a fila de cada assinante e
 * derrubariam os painéis abertos.
 */
@Service
public class EventosService implements SmartLifecycle {

    public static final String EVENTO_JANELA = "janela";
    public static final String EVENTO_ENSAIO = "ensaio";
    public static final String EVENTO_MODO_RAPIDO = "modo_rapido";
    public static final String EVENTO_MARCADO = "evento_marcado";
    public static final String EVENTO_RECUPERACAO = "recuperacao";
    public static final String EVENTO_ALERTA = "alerta";
    public static final String EVENTO_OS = "os";
    public static final String EVENTO_TREINO = "treino";
    public static final String EVENTO_MODELO = "modelo";

    private static final Logger log = LoggerFactory.getLogger(EventosService.class);
    private static final int FILA_DA_DIFUSAO = 256;

    private final PropriedadesEventos propriedades;
    private final JanelaService janelas;
    private final ObjectMapper json;
    private final LongFunction<SseEmitter> novoEmissor;

    private final Map<Long, Set<Assinante>> porMaquina = new ConcurrentHashMap<>();
    /** Protege a contagem e a entrada e saída de assinantes; a leitura para difusão não trava. */
    private final Object trava = new Object();
    private int total;
    private final ThreadPoolExecutor difusor;
    /** Fecha as recuperações no fim de cada intervalo. */
    private final ScheduledExecutorService agendador;
    /** Janelas antigas acumuladas por máquina e tipo de dado, até o fim do intervalo. */
    private final Map<ChaveRecuperacao, Recuperacao> recuperacoes = new ConcurrentHashMap<>();
    private volatile boolean rodando;

    @Autowired
    public EventosService(PropriedadesEventos propriedades, JanelaService janelas, ObjectMapper json) {
        this(propriedades, janelas, json, SseEmitter::new);
    }

    EventosService(PropriedadesEventos propriedades, JanelaService janelas, ObjectMapper json,
                   LongFunction<SseEmitter> novoEmissor) {
        this.propriedades = propriedades;
        this.janelas = janelas;
        this.json = json;
        this.novoEmissor = novoEmissor;
        this.difusor = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(FILA_DA_DIFUSAO),
                tarefa -> {
                    Thread thread = new Thread(tarefa, "eventos-difusao");
                    thread.setDaemon(true);
                    return thread;
                },
                (tarefa, executor) -> log.warn("Fila de difusão de eventos cheia: evento descartado"));
        this.agendador = Executors.newSingleThreadScheduledExecutor(tarefa -> {
            Thread thread = new Thread(tarefa, "eventos-recuperacao");
            thread.setDaemon(true);
            return thread;
        });
    }

    /**
     * Registra um assinante dos eventos da máquina e devolve o fluxo. O primeiro evento é o estado
     * atual do modo rápido.
     *
     * @param veEnsaios se o papel do usuário pode receber eventos de ensaio (ADMIN e TECNICO)
     * @param simulado  filtra os eventos por dado simulado (true) ou real (false); nulo recebe os dois
     * @throws LimiteDeConexoesException se o usuário (429) ou o servidor (503) já está no limite
     */
    public SseEmitter assinar(Long maquinaId, long usuarioId, boolean veEnsaios, Boolean simulado,
                              ModoRapidoResposta estadoInicial) {
        Mensagem inicial = mensagem(EVENTO_MODO_RAPIDO, estadoInicial);
        Assinante novo;
        synchronized (trava) {
            if (!rodando) {
                throw new LimiteDeConexoesException(HttpStatus.SERVICE_UNAVAILABLE,
                        "O servidor está encerrando. Tente novamente em instantes.");
            }
            if (total >= propriedades.maxTotal()) {
                throw new LimiteDeConexoesException(HttpStatus.SERVICE_UNAVAILABLE,
                        "O servidor atingiu o limite de " + propriedades.maxTotal()
                                + " conexões de eventos ao vivo. Tente novamente em instantes.");
            }
            long doUsuario = porMaquina.values().stream().flatMap(Set::stream)
                    .filter(a -> a.usuarioId == usuarioId).count();
            if (doUsuario >= propriedades.maxPorUsuario()) {
                throw new LimiteDeConexoesException(HttpStatus.TOO_MANY_REQUESTS,
                        "Limite de " + propriedades.maxPorUsuario() + " conexões de eventos ao vivo por usuário "
                                + "atingido. Feche outra aba do painel e tente de novo.");
            }
            novo = new Assinante(maquinaId, usuarioId, veEnsaios, simulado,
                    novoEmissor.apply(propriedades.duracaoMaxima().toMillis()), propriedades.filaPorAssinante());
            porMaquina.computeIfAbsent(maquinaId, id -> ConcurrentHashMap.newKeySet()).add(novo);
            total++;
        }
        novo.emissor.onCompletion(() -> encerrar(novo));
        novo.emissor.onTimeout(() -> encerrar(novo));
        novo.emissor.onError(erro -> encerrar(novo));
        // O primeiro evento sai aqui, na thread do pedido e antes de existir a thread de envio. O Spring
        // o guarda e o escreve ao iniciar a resposta, ainda nesta thread, e é essa escrita que grava os
        // cabeçalhos (commit). Saindo da thread de envio, o commit podia coincidir com o fim da cadeia de
        // filtros, em que o HeaderWriterFilter do Spring Security ainda grava cabeçalhos na mesma resposta:
        // duas threads no mesmo MimeHeaders do Tomcat, com NullPointerException em MimeHeaders.setValue.
        // Depois do commit, a thread de envio só escreve corpo.
        if (!enviarUm(novo, SseEmitter.event().name(inicial.nome()).data(inicial.dados()))) {
            return novo.emissor;
        }
        novo.thread = new Thread(() -> enviar(novo), "eventos-envio-" + usuarioId);
        novo.thread.setDaemon(true);
        novo.thread.start();
        return novo.emissor;
    }

    public boolean temAssinantes(Long maquinaId) {
        Set<Assinante> assinantes = porMaquina.get(maquinaId);
        return assinantes != null && !assinantes.isEmpty();
    }

    /** Conexões de eventos abertas agora. */
    public int conexoes() {
        synchronized (trava) {
            return total;
        }
    }

    /** Janela nova gravada: lida do banco e difundida fora da thread de quem chamou. */
    public void publicarJanela(Long maquinaId, long janelaId) {
        if (!temAssinantes(maquinaId)) {
            return;
        }
        difundir(EVENTO_JANELA, () -> janelas.buscar(janelaId).ifPresent(janela -> distribuir(maquinaId,
                mensagem(EVENTO_JANELA, janela), a -> a.aceita(janela.simulado()))));
    }

    /** Ensaio aberto, encerrado ou descartado: só para quem pode ver ensaios. */
    public void publicarEnsaio(Long maquinaId, EnsaioEvento evento) {
        if (!temAssinantes(maquinaId)) {
            return;
        }
        difundir(EVENTO_ENSAIO, () -> distribuir(maquinaId, mensagem(EVENTO_ENSAIO, evento),
                a -> a.veEnsaios && a.aceita(evento.ensaio().simulado())));
    }

    /** Evento marcado num ensaio aberto: só para quem pode ver ensaios. */
    public void publicarEventoMarcado(Long maquinaId, boolean simulado,
                                      br.senai.predictspin.telemetria.dto.EventoMarcadoResposta evento) {
        if (!temAssinantes(maquinaId)) {
            return;
        }
        difundir(EVENTO_MARCADO, () -> distribuir(maquinaId, mensagem(EVENTO_MARCADO, evento),
                a -> a.veEnsaios && a.aceita(simulado)));
    }

    /** Alerta aberto, piorado, normalizado, reconhecido, suprimido ou encerrado: para quem vê o tipo de dado. */
    public void publicarAlerta(Long maquinaId, boolean simulado, Object evento) {
        publicarParaTodos(EVENTO_ALERTA, maquinaId, simulado, evento);
    }

    /** OS aberta, assumida ou concluída: para quem vê o tipo de dado. */
    public void publicarOrdemServico(Long maquinaId, boolean simulado, Object evento) {
        publicarParaTodos(EVENTO_OS, maquinaId, simulado, evento);
    }

    /** Trabalho de treino mudou de estado: para quem vê o tipo de dado. */
    public void publicarTreino(Long maquinaId, boolean simulado, Object evento) {
        publicarParaTodos(EVENTO_TREINO, maquinaId, simulado, evento);
    }

    /** Versão de modelo nova (candidata) ou ativada: para quem vê o tipo de dado. */
    public void publicarModelo(Long maquinaId, boolean simulado, Object evento) {
        publicarParaTodos(EVENTO_MODELO, maquinaId, simulado, evento);
    }

    private void publicarParaTodos(String nome, Long maquinaId, boolean simulado, Object evento) {
        if (!temAssinantes(maquinaId)) {
            return;
        }
        difundir(nome, () -> distribuir(maquinaId, mensagem(nome, evento), a -> a.aceita(simulado)));
    }

    /** Modo rápido ligado ou desligado, com o prazo. */
    public void publicarModoRapido(ModoRapidoResposta estado) {
        if (!temAssinantes(estado.maquinaId())) {
            return;
        }
        difundir(EVENTO_MODO_RAPIDO,
                () -> distribuir(estado.maquinaId(), mensagem(EVENTO_MODO_RAPIDO, estado), a -> true));
    }

    /**
     * Janela antiga gravada: entra no acumulado da máquina. A primeira de um período agenda o evento
     * "recuperacao" para o fim do intervalo; as seguintes só somam. Assim sai no máximo um evento por
     * intervalo, por máquina e tipo de dado (real ou simulado).
     */
    public void acumularRecuperacao(Long maquinaId, boolean simulado, Instant medidoEm) {
        if (!temAssinantes(maquinaId)) {
            return;
        }
        ChaveRecuperacao chave = new ChaveRecuperacao(maquinaId, simulado);
        recuperacoes.compute(chave, (k, atual) -> {
            if (atual == null) {
                agendar(k);
                return new Recuperacao(medidoEm, medidoEm, 1);
            }
            return atual.somar(medidoEm);
        });
    }

    private void agendar(ChaveRecuperacao chave) {
        try {
            agendador.schedule(() -> fecharRecuperacao(chave), propriedades.intervaloRecuperacao().toMillis(),
                    TimeUnit.MILLISECONDS);
        } catch (RejectedExecutionException e) {
            log.debug("Serviço de eventos encerrando: recuperação não agendada");
        }
    }

    private void fecharRecuperacao(ChaveRecuperacao chave) {
        Recuperacao acumulada = recuperacoes.remove(chave);
        if (acumulada == null) {
            return;
        }
        RecuperacaoEvento evento = new RecuperacaoEvento(chave.maquinaId(), chave.simulado(), acumulada.de(),
                acumulada.ate(), acumulada.quantidade());
        difundir(EVENTO_RECUPERACAO, () -> distribuir(chave.maquinaId(), mensagem(EVENTO_RECUPERACAO, evento),
                a -> a.aceita(chave.simulado())));
    }

    /** Entrega a tarefa à thread de difusão; falha em um evento não derruba os seguintes. */
    private void difundir(String evento, Runnable tarefa) {
        difusor.execute(() -> {
            try {
                tarefa.run();
            } catch (RuntimeException e) {
                log.warn("Falha ao difundir o evento {}", evento, e);
            }
        });
    }

    private void distribuir(Long maquinaId, Mensagem mensagem, Predicate<Assinante> quem) {
        Set<Assinante> assinantes = porMaquina.get(maquinaId);
        if (assinantes == null) {
            return;
        }
        for (Assinante assinante : assinantes) {
            if (quem.test(assinante) && !assinante.fila.offer(mensagem)) {
                log.info("Cliente de eventos lento descartado (usuário {}, máquina {})", assinante.usuarioId,
                        maquinaId);
                encerrar(assinante);
            }
        }
    }

    /** Laço da thread de envio de um assinante: manda o que chegar na fila ou, no silêncio, o batimento. */
    private void enviar(Assinante assinante) {
        long espera = propriedades.batimento().toMillis();
        try {
            boolean enviou = true;
            while (enviou && assinante.ativo.get()) {
                Mensagem mensagem = assinante.fila.poll(espera, TimeUnit.MILLISECONDS);
                if (!assinante.ativo.get()) {
                    break;
                }
                enviou = enviarUm(assinante, mensagem == null ? SseEmitter.event().comment("batimento")
                        : SseEmitter.event().name(mensagem.nome()).data(mensagem.dados()));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            encerrar(assinante);
        }
    }

    /**
     * Um envio no fluxo do assinante, um de cada vez (trava do assinante). Se a escrita falha (cliente
     * caído, resposta já encerrada), o assinante sai e a vaga é liberada.
     *
     * @return se enviou
     */
    private boolean enviarUm(Assinante assinante, SseEmitter.SseEventBuilder evento) {
        assinante.envio.lock();
        try {
            // fluxo já encerrado: o SseEmitter lança IllegalStateException, tratada abaixo
            assinante.emissor.send(evento);
            return true;
        } catch (IOException | RuntimeException e) {
            log.debug("Cliente de eventos desconectado (usuário {}): {}", assinante.usuarioId, e.toString());
            encerrar(assinante);
            return false;
        } finally {
            assinante.envio.unlock();
        }
    }

    private void encerrar(Assinante assinante) {
        if (!assinante.ativo.compareAndSet(true, false)) {
            return;
        }
        synchronized (trava) {
            Set<Assinante> assinantes = porMaquina.get(assinante.maquinaId);
            if (assinantes != null && assinantes.remove(assinante)) {
                total--;
                if (assinantes.isEmpty()) {
                    porMaquina.remove(assinante.maquinaId);
                }
            }
        }
        Thread thread = assinante.thread;
        if (thread != null && thread != Thread.currentThread()) {
            thread.interrupt();
        }
        try {
            assinante.emissor.complete();
        } catch (RuntimeException e) {
            log.debug("Fluxo de eventos já estava encerrado: {}", e.toString());
        }
    }

    private Mensagem mensagem(String nome, Object corpo) {
        try {
            return new Mensagem(nome, json.writeValueAsString(corpo));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Evento " + nome + " não pôde ser serializado", e);
        }
    }

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    public void start() {
        rodando = true;
    }

    /** Fecha os fluxos antes do desligamento gracioso do servidor, que esperaria por eles. */
    @Override
    public void stop() {
        rodando = false;
        porMaquina.values().stream().flatMap(Set::stream).toList().forEach(this::encerrar);
        agendador.shutdownNow();
        recuperacoes.clear();
        difusor.shutdownNow();
    }

    @Override
    public boolean isRunning() {
        return rodando;
    }

    // ------------------------------------------------------------------ tipos internos

    private record Mensagem(String nome, String dados) {
    }

    private record ChaveRecuperacao(Long maquinaId, boolean simulado) {
    }

    /** Período de janelas antigas: a mais antiga, a mais nova e quantas chegaram. */
    private record Recuperacao(Instant de, Instant ate, long quantidade) {
        private Recuperacao somar(Instant medidoEm) {
            return new Recuperacao(medidoEm.isBefore(de) ? medidoEm : de, medidoEm.isAfter(ate) ? medidoEm : ate,
                    quantidade + 1);
        }
    }

    private static final class Assinante {
        private final Long maquinaId;
        private final long usuarioId;
        private final boolean veEnsaios;
        private final Boolean simulado;
        private final SseEmitter emissor;
        private final BlockingQueue<Mensagem> fila;
        private final AtomicBoolean ativo = new AtomicBoolean(true);
        /**
         * Um envio por vez neste fluxo. O fechamento (complete) não usa esta trava: quem descarta um
         * cliente lento não pode esperar uma escrita parada nele.
         */
        private final ReentrantLock envio = new ReentrantLock();
        private volatile Thread thread;

        private Assinante(Long maquinaId, long usuarioId, boolean veEnsaios, Boolean simulado, SseEmitter emissor,
                          int capacidade) {
            this.maquinaId = maquinaId;
            this.usuarioId = usuarioId;
            this.veEnsaios = veEnsaios;
            this.simulado = simulado;
            this.emissor = emissor;
            this.fila = new ArrayBlockingQueue<>(capacidade);
        }

        private boolean aceita(boolean dadoSimulado) {
            return simulado == null || simulado == dadoSimulado;
        }
    }
}

package br.senai.predictspin.eventos;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
 */
@Service
public class EventosService implements SmartLifecycle {

    public static final String EVENTO_JANELA = "janela";
    public static final String EVENTO_ENSAIO = "ensaio";
    public static final String EVENTO_MODO_RAPIDO = "modo_rapido";
    public static final String EVENTO_MARCADO = "evento_marcado";

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
        novo.fila.offer(inicial);
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

    /** Modo rápido ligado ou desligado, com o prazo. */
    public void publicarModoRapido(ModoRapidoResposta estado) {
        if (!temAssinantes(estado.maquinaId())) {
            return;
        }
        difundir(EVENTO_MODO_RAPIDO,
                () -> distribuir(estado.maquinaId(), mensagem(EVENTO_MODO_RAPIDO, estado), a -> true));
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
            while (assinante.ativo.get()) {
                Mensagem mensagem = assinante.fila.poll(espera, TimeUnit.MILLISECONDS);
                if (!assinante.ativo.get()) {
                    break;
                }
                if (mensagem == null) {
                    assinante.emissor.send(SseEmitter.event().comment("batimento"));
                } else {
                    assinante.emissor.send(SseEmitter.event().name(mensagem.nome()).data(mensagem.dados()));
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (IOException | RuntimeException e) {
            log.debug("Cliente de eventos desconectado (usuário {}): {}", assinante.usuarioId, e.toString());
        } finally {
            encerrar(assinante);
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
        difusor.shutdownNow();
    }

    @Override
    public boolean isRunning() {
        return rodando;
    }

    // ------------------------------------------------------------------ tipos internos

    private record Mensagem(String nome, String dados) {
    }

    private static final class Assinante {
        private final Long maquinaId;
        private final long usuarioId;
        private final boolean veEnsaios;
        private final Boolean simulado;
        private final SseEmitter emissor;
        private final BlockingQueue<Mensagem> fila;
        private final AtomicBoolean ativo = new AtomicBoolean(true);
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

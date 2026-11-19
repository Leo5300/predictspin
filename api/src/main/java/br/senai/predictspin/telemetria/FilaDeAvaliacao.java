package br.senai.predictspin.telemetria;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.stereotype.Component;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Fila da avaliação das janelas novas, FORA do caminho da resposta do POST /api/v1/telemetria.
 * <ul>
 *   <li><b>Uma faixa por máquina e tipo de dado</b> (real ou simulado), com uma thread só: a ordem de chegada é
 *       preservada e duas avaliações da mesma máquina nunca disputam a trava das linhas de estado_ponto nem
 *       uma segunda conexão do pool (o que fazia a resposta esperar: docs/teste-de-carga.md, 19/11/2026).</li>
 *   <li><b>Fila curta</b> ({@code ps.avaliacao.fila-max}). Cheia, quem chega espera até
 *       {@code ps.avaliacao.espera-fila-ms} por uma vaga (a resposta só atrasa quando a avaliação não dá conta);
 *       depois disso a janela fica gravada sem avaliação e é contada em {@link #descartadas()}.</li>
 *   <li><b>Erro isolado</b>: uma tarefa que falha não derruba a faixa; é contada em {@link #falhas()}.</li>
 * </ul>
 * A thread de uma faixa parada some depois de 60 s sem trabalho.
 */
@Component
public class FilaDeAvaliacao implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(FilaDeAvaliacao.class);

    /**
     * @param filaMax      janelas esperando avaliação por máquina e tipo de dado
     * @param esperaFilaMs quanto quem chega espera por uma vaga com a fila cheia (ms)
     */
    @ConfigurationProperties("ps.avaliacao")
    @Schema(name = "PropriedadesAvaliacao")
    public record Propriedades(@DefaultValue("64") int filaMax, @DefaultValue("2000") long esperaFilaMs) {
    }

    private record Faixa(long maquinaId, boolean simulado) {
    }

    private final Propriedades prop;
    private final boolean imediata;
    private final Map<Faixa, ThreadPoolExecutor> faixas = new ConcurrentHashMap<>();
    private final AtomicLong descartadas = new AtomicLong();
    private final AtomicLong falhas = new AtomicLong();
    private final AtomicInteger pendentes = new AtomicInteger();

    @Autowired
    public FilaDeAvaliacao(Propriedades prop) {
        this(prop, false);
    }

    private FilaDeAvaliacao(Propriedades prop, boolean imediata) {
        this.prop = prop;
        this.imediata = imediata;
    }

    /** Roda cada tarefa na hora, na thread de quem chama (testes de unidade). */
    public static FilaDeAvaliacao imediata() {
        return new FilaDeAvaliacao(new Propriedades(1, 0), true);
    }

    /** Põe a tarefa na faixa da máquina; não espera ela rodar (só espera vaga, com a fila cheia). */
    public void enfileirar(long maquinaId, boolean simulado, Runnable tarefa) {
        Runnable protegida = () -> {
            try {
                tarefa.run();
            } catch (RuntimeException e) {
                falhas.incrementAndGet();
                log.error("Falha na avaliação da máquina {} (simulado={})", maquinaId, simulado, e);
            } finally {
                pendentes.decrementAndGet();
            }
        };
        pendentes.incrementAndGet();
        if (imediata) {
            protegida.run();
            return;
        }
        try {
            faixas.computeIfAbsent(new Faixa(maquinaId, simulado), this::criar).execute(protegida);
        } catch (RejectedExecutionException e) {
            pendentes.decrementAndGet();
            descartadas.incrementAndGet();
            log.warn("Fila de avaliação da máquina {} (simulado={}) cheia por {} ms: janela gravada sem avaliação",
                    maquinaId, simulado, prop.esperaFilaMs());
        }
    }

    private ThreadPoolExecutor criar(Faixa f) {
        String nome = "avaliacao-" + f.maquinaId() + (f.simulado() ? "-sim" : "-real");
        RejectedExecutionHandler esperarVaga = (tarefa, executor) -> {
            if (executor.isShutdown()) {
                throw new RejectedExecutionException("fila de avaliação encerrada");
            }
            try {
                if (!executor.getQueue().offer(tarefa, prop.esperaFilaMs(), TimeUnit.MILLISECONDS)) {
                    throw new RejectedExecutionException("fila de avaliação cheia");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RejectedExecutionException("interrompido esperando vaga na fila de avaliação", e);
            }
        };
        ThreadPoolExecutor executor = new ThreadPoolExecutor(1, 1, 60, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(Math.max(1, prop.filaMax())), r -> {
                    Thread t = new Thread(r, nome);
                    t.setDaemon(true);
                    return t;
                }, esperarVaga);
        executor.allowCoreThreadTimeOut(true);
        return executor;
    }

    /** Janelas esperando avaliação agora, somando todas as máquinas. */
    public int naFila() {
        return faixas.values().stream().mapToInt(e -> e.getQueue().size()).sum();
    }

    /** Janelas que ficaram sem avaliação porque a fila continuou cheia (desde que a API subiu). */
    public long descartadas() {
        return descartadas.get();
    }

    /** Tarefas da fila que terminaram em erro não tratado (desde que a API subiu). */
    public long falhas() {
        return falhas.get();
    }

    public Propriedades propriedades() {
        return prop;
    }

    /**
     * Espera todas as faixas ficarem vazias e paradas, até {@code maximo}. Devolve false se o prazo acabou.
     * Usado nos testes, que conferem o efeito da avaliação logo depois do POST.
     */
    public boolean aguardarOcioso(Duration maximo) {
        long limite = System.nanoTime() + maximo.toNanos();
        while (System.nanoTime() < limite) {
            if (pendentes.get() == 0) {
                return true;
            }
            try {
                Thread.sleep(2);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    /** No desligamento, termina o que já está na fila (até 10 s). */
    @Override
    public void destroy() throws InterruptedException {
        faixas.values().forEach(ThreadPoolExecutor::shutdown);
        for (ThreadPoolExecutor e : faixas.values()) {
            if (!e.awaitTermination(10, TimeUnit.SECONDS)) {
                log.warn("Avaliações ainda na fila no desligamento: {}", e.getQueue().size());
                e.shutdownNow();
            }
        }
    }
}

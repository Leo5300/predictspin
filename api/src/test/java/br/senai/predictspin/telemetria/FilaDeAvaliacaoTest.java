package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class FilaDeAvaliacaoTest {

    private FilaDeAvaliacao fila;

    @AfterEach
    void encerrar() throws InterruptedException {
        if (fila != null) {
            fila.destroy();
        }
    }

    @Test
    void preservaAOrdemDaMesmaMaquinaENaoPrendeQuemEnfileira() {
        fila = new FilaDeAvaliacao(new FilaDeAvaliacao.Propriedades(64, 2000));
        List<Integer> ordem = new CopyOnWriteArrayList<>();
        long inicio = System.nanoTime();
        for (int i = 0; i < 50; i++) {
            int n = i;
            fila.enfileirar(1, true, () -> {
                dormir(1);
                ordem.add(n);
            });
        }
        // 50 tarefas de ~1 ms: quem enfileira não esperou por elas
        assertThat(Duration.ofNanos(System.nanoTime() - inicio)).isLessThan(Duration.ofMillis(40));
        assertThat(fila.aguardarOcioso(Duration.ofSeconds(10))).isTrue();
        assertThat(ordem).hasSize(50).isSorted();
        assertThat(fila.naFila()).isZero();
    }

    @Test
    void maquinasDiferentesNaoEsperamUmaPelaOutra() throws InterruptedException {
        fila = new FilaDeAvaliacao(new FilaDeAvaliacao.Propriedades(8, 2000));
        CountDownLatch solta = new CountDownLatch(1);
        CountDownLatch outraRodou = new CountDownLatch(1);
        fila.enfileirar(1, true, () -> esperar(solta));
        fila.enfileirar(2, true, outraRodou::countDown);
        fila.enfileirar(1, false, () -> { });
        assertThat(outraRodou.await(5, TimeUnit.SECONDS)).isTrue();
        solta.countDown();
        assertThat(fila.aguardarOcioso(Duration.ofSeconds(5))).isTrue();
    }

    @Test
    void filaCheiaEsperaOPrazoEDepoisDescartaEConta() {
        fila = new FilaDeAvaliacao(new FilaDeAvaliacao.Propriedades(1, 50));
        CountDownLatch solta = new CountDownLatch(1);
        fila.enfileirar(1, true, () -> esperar(solta)); // rodando
        fila.enfileirar(1, true, () -> { });           // na fila (capacidade 1)
        assertThat(fila.naFila()).isEqualTo(1);
        long inicio = System.nanoTime();
        fila.enfileirar(1, true, () -> { });           // sem vaga: espera 50 ms e desiste
        assertThat(Duration.ofNanos(System.nanoTime() - inicio)).isGreaterThanOrEqualTo(Duration.ofMillis(40));
        assertThat(fila.descartadas()).isEqualTo(1);
        solta.countDown();
        assertThat(fila.aguardarOcioso(Duration.ofSeconds(5))).isTrue();
        assertThat(fila.propriedades().filaMax()).isEqualTo(1);
    }

    @Test
    void erroNumaTarefaNaoDerrubaAFaixaEEhContado() {
        fila = new FilaDeAvaliacao(new FilaDeAvaliacao.Propriedades(8, 2000));
        List<String> feitas = new CopyOnWriteArrayList<>();
        fila.enfileirar(1, true, () -> {
            throw new IllegalStateException("falha forçada no teste");
        });
        fila.enfileirar(1, true, () -> feitas.add("seguinte"));
        assertThat(fila.aguardarOcioso(Duration.ofSeconds(5))).isTrue();
        assertThat(fila.falhas()).isEqualTo(1);
        assertThat(feitas).containsExactly("seguinte");
    }

    @Test
    void imediataRodaNaThreadDeQuemChamaEDesligaSemNada() throws InterruptedException {
        fila = FilaDeAvaliacao.imediata();
        Thread[] quem = new Thread[1];
        fila.enfileirar(1, true, () -> quem[0] = Thread.currentThread());
        assertThat(quem[0]).isSameAs(Thread.currentThread());
        fila.enfileirar(1, true, () -> {
            throw new IllegalStateException("falha forçada no teste");
        });
        assertThat(fila.falhas()).isEqualTo(1);
        assertThat(fila.aguardarOcioso(Duration.ofMillis(10))).isTrue();
    }

    private static void dormir(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void esperar(CountDownLatch latch) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

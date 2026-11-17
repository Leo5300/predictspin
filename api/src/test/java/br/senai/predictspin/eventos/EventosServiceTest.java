package br.senai.predictspin.eventos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import br.senai.predictspin.comum.LimiteDeConexoesException;
import br.senai.predictspin.eventos.dto.EnsaioEvento;
import br.senai.predictspin.maquina.dto.ModoRapidoResposta;
import br.senai.predictspin.telemetria.Condicao;
import br.senai.predictspin.telemetria.EnsaioAlterado;
import br.senai.predictspin.telemetria.Etapa;
import br.senai.predictspin.telemetria.JanelaService;
import br.senai.predictspin.telemetria.ModoJanela;
import br.senai.predictspin.telemetria.dto.EnsaioResposta;
import br.senai.predictspin.telemetria.dto.JanelaResposta;

class EventosServiceTest {

    private static final long MAQUINA = 1L;
    private static final ModoRapidoResposta DESLIGADO = new ModoRapidoResposta(MAQUINA, false, null);

    private JanelaService janelas;
    private final List<EmissorDeTeste> emissores = new CopyOnWriteArrayList<>();
    private EventosService servico;

    /** Emissor que guarda o que foi enviado e pode travar o envio, como um cliente que não lê. */
    private static final class EmissorDeTeste extends SseEmitter {
        private final List<String> enviados = new CopyOnWriteArrayList<>();
        private final CountDownLatch trava = new CountDownLatch(1);
        private volatile boolean travado;
        private volatile boolean falha;
        private volatile boolean completo;
        private volatile boolean falhaAoCompletar;

        private EmissorDeTeste(long tempoLimite) {
            super(tempoLimite);
        }

        @Override
        public void send(SseEventBuilder evento) throws IOException {
            if (falha) {
                throw new IOException("conexão fechada pelo cliente");
            }
            if (travado) {
                try {
                    trava.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException(e);
                }
            }
            StringBuilder texto = new StringBuilder();
            evento.build().forEach(parte -> texto.append(parte.getData()));
            enviados.add(texto.toString());
        }

        @Override
        public synchronized void complete() {
            completo = true;
            trava.countDown();
            if (falhaAoCompletar) {
                throw new IllegalStateException("resposta já encerrada");
            }
        }
    }

    @BeforeEach
    void criar() {
        janelas = mock(JanelaService.class);
        iniciar(new PropriedadesEventos(2, 3, Duration.ofMillis(150), 4, Duration.ofMinutes(30)));
    }

    private void iniciar(PropriedadesEventos propriedades) {
        ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        iniciar(propriedades, json);
    }

    private void iniciar(PropriedadesEventos propriedades, ObjectMapper json) {
        servico = new EventosService(propriedades, janelas, json, tempoLimite -> {
            EmissorDeTeste emissor = new EmissorDeTeste(tempoLimite);
            emissores.add(emissor);
            return emissor;
        });
        servico.start();
    }

    @AfterEach
    void parar() {
        servico.stop();
    }

    private EmissorDeTeste assinar(long usuario, boolean veEnsaios, Boolean simulado) {
        return (EmissorDeTeste) servico.assinar(MAQUINA, usuario, veEnsaios, simulado, DESLIGADO);
    }

    private static void esperar(BooleanSupplier condicao) {
        long limite = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!condicao.getAsBoolean()) {
            if (System.nanoTime() > limite) {
                throw new AssertionError("condição não atingida em 5 s");
            }
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        }
    }

    private static boolean recebeu(EmissorDeTeste emissor, String trecho) {
        return emissor.enviados.stream().anyMatch(e -> e.contains(trecho));
    }

    private static JanelaResposta janela(long id, boolean simulado) {
        return new JanelaResposta(id, Instant.parse("2026-11-12T12:00:00Z"), Instant.parse("2026-11-12T12:00:01Z"),
                1120.0, false, ModoJanela.NORMAL, 8000, 8000, simulado, simulado ? "ps-sim-01" : "ps-torno-01",
                null, null, Map.of(), Map.of());
    }

    private static EnsaioResposta ensaio(boolean simulado) {
        return new EnsaioResposta(5L, MAQUINA, "TORNO-01-T1-00005", Etapa.T1, Condicao.NORMAL, null, 900, null, 1,
                null, true, false, simulado, Instant.parse("2026-11-12T12:00:00Z"), null);
    }

    @Test
    void primeiroEventoEhOEstadoDoModoRapidoEOSilencioViraBatimento() {
        EmissorDeTeste emissor = assinar(10, false, null);

        esperar(() -> recebeu(emissor, "event:modo_rapido"));
        assertThat(emissor.enviados.get(0)).contains("\"maquina_id\":1").contains("\"ativo\":false");
        esperar(() -> recebeu(emissor, ":batimento"));
        assertThat(servico.conexoes()).isEqualTo(1);
        assertThat(servico.temAssinantes(MAQUINA)).isTrue();
        assertThat(servico.temAssinantes(2L)).isFalse();
    }

    @Test
    void janelaVaiParaQuemAssinaAMesmaFonteEmSnakeCase() {
        EmissorDeTeste todos = assinar(10, false, null);
        EmissorDeTeste soReal = assinar(11, false, false);
        EmissorDeTeste soSimulado = assinar(12, false, true);
        when(janelas.buscar(77L)).thenReturn(Optional.of(janela(77L, true)));

        servico.publicarJanela(MAQUINA, 77L);

        esperar(() -> recebeu(todos, "event:janela") && recebeu(soSimulado, "event:janela"));
        String evento = todos.enviados.stream().filter(e -> e.contains("event:janela")).findFirst().orElseThrow();
        assertThat(evento).contains("\"id\":77").contains("\"medido_em\":\"2026-11-12T12:00:00Z\"")
                .contains("\"rotacao_rpm\":1120.0").contains("\"simulado\":true");
        esperar(() -> recebeu(soReal, ":batimento"));
        assertThat(recebeu(soReal, "event:janela")).isFalse();
    }

    @Test
    void semAssinanteNadaEhLidoDoBanco() throws InterruptedException {
        servico.publicarJanela(MAQUINA, 77L);
        servico.publicarEnsaio(MAQUINA, new EnsaioEvento(EnsaioAlterado.Acao.ABERTO, ensaio(false)));
        servico.publicarModoRapido(DESLIGADO);
        Thread.sleep(50);
        verify(janelas, never()).buscar(anyLong());
    }

    @Test
    void eventoDeEnsaioSoChegaParaQuemPodeVerEnsaios() {
        EmissorDeTeste tecnico = assinar(10, true, null);
        EmissorDeTeste operador = assinar(11, false, null);

        servico.publicarEnsaio(MAQUINA, new EnsaioEvento(EnsaioAlterado.Acao.ENCERRADO, ensaio(true)));
        servico.publicarModoRapido(new ModoRapidoResposta(MAQUINA, true, Instant.parse("2026-11-12T12:02:00Z")));

        esperar(() -> recebeu(tecnico, "event:ensaio") && recebeu(operador, "\"ativo\":true"));
        assertThat(tecnico.enviados.stream().filter(e -> e.contains("event:ensaio")).findFirst().orElseThrow())
                .contains("\"acao\":\"encerrado\"").contains("\"codigo\":\"TORNO-01-T1-00005\"");
        assertThat(recebeu(operador, "event:ensaio")).isFalse();
        assertThat(recebeu(tecnico, "\"modo_rapido_ate\":\"2026-11-12T12:02:00Z\"")).isTrue();
    }

    @Test
    void eventoMarcadoSoChegaParaQuemPodeVerEnsaiosDaMesmaFonte() {
        EmissorDeTeste tecnico = assinar(10, true, null);
        EmissorDeTeste soReal = assinar(11, true, false);
        EmissorDeTeste operador = assinar(12, false, null);

        servico.publicarEventoMarcado(MAQUINA, true, new br.senai.predictspin.telemetria.dto.EventoMarcadoResposta(
                3L, 5L, "TORNO-01-T1-00005", Instant.parse("2026-11-12T12:00:07Z"),
                br.senai.predictspin.telemetria.MotivoEvento.MAQUINA_VIZINHA, null, 10L,
                Instant.parse("2026-11-12T12:00:09Z")));
        servico.publicarModoRapido(new ModoRapidoResposta(MAQUINA, false, null));

        esperar(() -> recebeu(tecnico, "event:evento_marcado") && recebeu(operador, "\"ativo\":false"));
        assertThat(tecnico.enviados.stream().filter(e -> e.contains("event:evento_marcado")).findFirst()
                .orElseThrow()).contains("\"motivo\":\"maquina_vizinha\"").contains("\"ensaio_id\":5");
        assertThat(recebeu(operador, "event:evento_marcado")).isFalse();
        esperar(() -> recebeu(soReal, "\"ativo\":false"));
        assertThat(recebeu(soReal, "event:evento_marcado")).isFalse();
    }

    @Test
    void limitePorUsuarioResponde429ELimiteTotal503() {
        assinar(10, false, null);
        assinar(10, false, null);
        assertThatThrownBy(() -> assinar(10, false, null))
                .isInstanceOfSatisfying(LimiteDeConexoesException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS))
                .hasMessageContaining("por usuário");

        assinar(11, false, null);
        assertThatThrownBy(() -> assinar(12, false, null))
                .isInstanceOfSatisfying(LimiteDeConexoesException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        assertThat(servico.conexoes()).isEqualTo(3);
    }

    @Test
    void clienteQueCaiLiberaAVaga() {
        EmissorDeTeste emissor = assinar(10, false, null);
        assinar(10, false, null);
        esperar(() -> recebeu(emissor, "event:modo_rapido"));

        emissor.falha = true;
        esperar(() -> servico.conexoes() == 1);

        assertThat(emissor.completo).isTrue();
        assinar(10, false, null);
        assertThat(servico.conexoes()).isEqualTo(2);
    }

    @Test
    void clienteLentoEhDescartadoSemSegurarQuemPublica() {
        parar();
        emissores.clear();
        iniciar(new PropriedadesEventos(2, 3, Duration.ofSeconds(30), 2, Duration.ofMinutes(30)));
        EmissorDeTeste lento = (EmissorDeTeste) servico.assinar(MAQUINA, 10, false, null, DESLIGADO);
        lento.travado = true;
        EmissorDeTeste rapido = assinar(11, false, null);
        esperar(() -> recebeu(rapido, "event:modo_rapido"));

        // A fila de cada assinante tem 2 lugares. O rápido só continua assinante se a thread de envio dele
        // esvaziar a fila a tempo; publicar as 8 de uma vez dependia de ela ganhar a corrida contra a
        // difusão, e num executor lento o próprio rápido estourava a fila e era descartado como lento.
        // Por isso cada publicação espera o rápido receber a anterior. O tempo medido é só o de quem
        // publica, e o lento, travado desde a primeira, continua enchendo a fila sem segurar ninguém.
        List<Long> duracoes = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            long inicio = System.nanoTime();
            servico.publicarModoRapido(new ModoRapidoResposta(MAQUINA, true, Instant.parse("2026-11-12T12:02:00Z")));
            duracoes.add(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - inicio));
            long esperadas = i + 1;
            esperar(() -> rapido.enviados.stream().filter(e -> e.contains("\"ativo\":true")).count() == esperadas);
        }

        esperar(() -> servico.conexoes() == 1);
        assertThat(lento.completo).isTrue();
        assertThat(duracoes).allMatch(ms -> ms < 200);
        esperar(() -> rapido.enviados.stream().filter(e -> e.contains("\"ativo\":true")).count() == 8);
    }

    @Test
    void aoPararFechaOsFluxosERecusaNovos() {
        EmissorDeTeste emissor = assinar(10, false, null);

        servico.stop();

        assertThat(emissor.completo).isTrue();
        assertThat(servico.conexoes()).isZero();
        assertThat(servico.isRunning()).isFalse();
        assertThatThrownBy(() -> assinar(10, false, null)).isInstanceOf(LimiteDeConexoesException.class);
    }

    @Test
    void falhaAoLerUmaJanelaNaoImpedeOsEventosSeguintes() {
        EmissorDeTeste emissor = assinar(10, false, null);
        when(janelas.buscar(1L)).thenThrow(new IllegalStateException("banco fora do ar"));
        when(janelas.buscar(2L)).thenReturn(Optional.empty());
        when(janelas.buscar(3L)).thenReturn(Optional.of(janela(3L, false)));

        servico.publicarJanela(MAQUINA, 1L);
        servico.publicarJanela(MAQUINA, 2L);
        servico.publicarJanela(MAQUINA, 3L);

        esperar(() -> recebeu(emissor, "event:janela"));
        assertThat(emissor.enviados.stream().filter(e -> e.contains("event:janela")).count()).isEqualTo(1);
        assertThat(recebeu(emissor, "\"id\":3")).isTrue();
    }

    @Test
    void filaDeDifusaoCheiaDescartaEventosSemBloquearQuemPublica() throws InterruptedException {
        parar();
        emissores.clear();
        iniciar(new PropriedadesEventos(2, 3, Duration.ofSeconds(30), 2000, Duration.ofMinutes(30)));
        EmissorDeTeste emissor = (EmissorDeTeste) servico.assinar(MAQUINA, 10, false, null, DESLIGADO);
        CountDownLatch bancoLento = new CountDownLatch(1);
        when(janelas.buscar(1L)).thenAnswer(chamada -> {
            bancoLento.await();
            return Optional.empty();
        });
        ModoRapidoResposta ligado = new ModoRapidoResposta(MAQUINA, true, Instant.parse("2026-11-12T12:02:00Z"));

        servico.publicarJanela(MAQUINA, 1L);
        long inicio = System.nanoTime();
        for (int i = 0; i < 600; i++) {
            servico.publicarModoRapido(ligado);
        }
        long ms = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - inicio);
        bancoLento.countDown();

        assertThat(ms).isLessThan(1000);
        // a fila da difusão guarda 256: o excedente foi descartado, o que coube foi entregue
        esperar(() -> emissor.enviados.stream().filter(e -> e.contains("\"ativo\":true")).count() >= 256);
        Thread.sleep(100);
        assertThat(emissor.enviados.stream().filter(e -> e.contains("\"ativo\":true")).count()).isLessThan(600);
        assertThat(servico.conexoes()).isEqualTo(1);
    }

    @Test
    void eventoQueNaoSerializaNaoDeixaAssinantePendurado() throws Exception {
        parar();
        ObjectMapper quebrado = mock(ObjectMapper.class);
        when(quebrado.writeValueAsString(org.mockito.ArgumentMatchers.any()))
                .thenThrow(new com.fasterxml.jackson.core.JsonProcessingException("não serializa") { });
        iniciar(new PropriedadesEventos(2, 3, Duration.ofSeconds(30), 4, Duration.ofMinutes(30)), quebrado);

        assertThatThrownBy(() -> assinar(10, false, null)).isInstanceOf(IllegalStateException.class);
        assertThat(servico.conexoes()).isZero();
    }

    @Test
    void erroAoFecharOFluxoNaoImpedeALiberacaoDaVaga() {
        EmissorDeTeste emissor = assinar(10, false, null);
        esperar(() -> recebeu(emissor, "event:modo_rapido"));
        emissor.falhaAoCompletar = true;

        emissor.falha = true;

        esperar(() -> servico.conexoes() == 0);
        assertThat(servico.temAssinantes(MAQUINA)).isFalse();
    }

    @Test
    void assinanteQueSaiAntesDaDifusaoNaoQuebraNada() {
        EmissorDeTeste emissor = assinar(10, false, null);
        esperar(() -> recebeu(emissor, "event:modo_rapido"));
        CountDownLatch bancoLento = new CountDownLatch(1);
        when(janelas.buscar(1L)).thenAnswer(chamada -> {
            bancoLento.await();
            return Optional.of(janela(1L, false));
        });

        // os dois eventos entram na fila com o assinante presente; ele cai antes de serem difundidos
        servico.publicarJanela(MAQUINA, 1L);
        servico.publicarModoRapido(new ModoRapidoResposta(MAQUINA, true, Instant.parse("2026-11-12T12:02:00Z")));
        emissor.falha = true;
        esperar(() -> servico.conexoes() == 0);
        bancoLento.countDown();

        EmissorDeTeste novo = assinar(11, false, null);
        esperar(() -> recebeu(novo, "event:modo_rapido"));
        assertThat(recebeu(emissor, "event:janela")).isFalse();
    }
}

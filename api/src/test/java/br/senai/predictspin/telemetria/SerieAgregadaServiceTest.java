package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.maquina.MaquinaRepository;

class SerieAgregadaServiceTest {

    private static final Instant AGORA = Instant.parse("2026-11-12T12:00:00Z");
    private static final long MAQUINA = 1L;

    private SerieRepository series;
    private MaquinaRepository maquinas;
    private SerieAgregadaService servico;

    @BeforeEach
    void criar() {
        series = mock(SerieRepository.class);
        maquinas = mock(MaquinaRepository.class);
        when(maquinas.existsById(MAQUINA)).thenReturn(true);
        servico = new SerieAgregadaService(series, maquinas, Clock.fixed(AGORA, ZoneOffset.UTC));
    }

    private static SerieRepository.Linha linha(int balde, long janelas, String ponto, double rms) {
        return new SerieRepository.Linha(balde, janelas, 1100.0 + balde, balde == 2, ponto, rms, rms * 1.5, rms * 4,
                3.0, rms * 0.6, rms * 0.2, rms * 0.1);
    }

    @Test
    void divideOPeriodoEmIntervalosIguaisEDeixaALacunaVazia() {
        Instant de = AGORA.minusSeconds(400);
        when(series.agregar(MAQUINA, de, AGORA, true, 4, 100.0)).thenReturn(List.of(
                linha(0, 20, "A", 0.10), linha(0, 20, "B", 0.20),
                linha(2, 7, "A", 0.30)));

        var serie = servico.agregar(MAQUINA, de, AGORA, true, 4);

        assertThat(serie.baldes()).isEqualTo(4);
        assertThat(serie.segundosPorBalde()).isEqualTo(100.0);
        assertThat(serie.pontos()).containsExactly("A", "B");
        assertThat(serie.intervalos()).hasSize(4);

        var primeiro = serie.intervalos().get(0);
        assertThat(primeiro.inicio()).isEqualTo(de);
        assertThat(primeiro.fim()).isEqualTo(de.plusSeconds(100));
        assertThat(primeiro.janelas()).isEqualTo(20);
        assertThat(primeiro.rotacaoMediaRpm()).isEqualTo(1100.0);
        assertThat(primeiro.pontos()).containsOnlyKeys("A", "B");
        assertThat(primeiro.pontos().get("B").rmsMediaG()).isEqualTo(0.20);
        assertThat(primeiro.pontos().get("B").rmsMaxG()).isEqualTo(0.20 * 1.5);

        var lacuna = serie.intervalos().get(1);
        assertThat(lacuna.janelas()).isZero();
        assertThat(lacuna.rotacaoMediaRpm()).isNull();
        assertThat(lacuna.saturou()).isFalse();
        assertThat(lacuna.pontos()).isEmpty();

        var terceiro = serie.intervalos().get(2);
        assertThat(terceiro.saturou()).isTrue();
        assertThat(terceiro.pontos()).containsOnlyKeys("A");
        assertThat(serie.intervalos().get(3).fim()).isEqualTo(AGORA);
    }

    @Test
    void intervaloComJanelaSemPontoContaAJanelaMasNaoInventaPonto() {
        Instant de = AGORA.minusSeconds(60);
        when(series.agregar(anyLong(), any(), any(), any(), anyInt(), anyDouble()))
                .thenReturn(List.of(linha(0, 3, null, 0)));

        var serie = servico.agregar(MAQUINA, de, AGORA, null, 1);

        assertThat(serie.pontos()).isEmpty();
        assertThat(serie.intervalos().get(0).janelas()).isEqualTo(3);
        assertThat(serie.intervalos().get(0).pontos()).isEmpty();
    }

    @Test
    void semPeriodoUsaAsUltimas24Horas() {
        when(series.agregar(anyLong(), any(), any(), any(), anyInt(), anyDouble())).thenReturn(List.of());

        var serie = servico.agregar(MAQUINA, null, null, false, 120);

        assertThat(serie.ate()).isEqualTo(AGORA);
        assertThat(serie.de()).isEqualTo(AGORA.minusSeconds(24 * 3600));
        assertThat(serie.segundosPorBalde()).isEqualTo(720.0);
        verify(series).agregar(MAQUINA, AGORA.minusSeconds(24 * 3600), AGORA, false, 120, 720.0);
    }

    @Test
    void recusaEntradasInvalidas() {
        Instant de = AGORA.minusSeconds(60);
        assertThatThrownBy(() -> servico.agregar(MAQUINA, de, AGORA, null, 0))
                .isInstanceOf(RequisicaoInvalidaException.class);
        assertThatThrownBy(() -> servico.agregar(MAQUINA, de, AGORA, null, 601))
                .isInstanceOf(RequisicaoInvalidaException.class);
        assertThatThrownBy(() -> servico.agregar(MAQUINA, AGORA, de, null, 10))
                .isInstanceOf(RequisicaoInvalidaException.class);
        assertThatThrownBy(() -> servico.agregar(MAQUINA, AGORA.minusSeconds(32L * 24 * 3600), AGORA, null, 10))
                .isInstanceOf(RequisicaoInvalidaException.class)
                .hasMessageContaining("31 dias");

        when(maquinas.existsById(99L)).thenReturn(false);
        assertThatThrownBy(() -> servico.agregar(99L, de, AGORA, null, 10))
                .isInstanceOf(RecursoNaoEncontradoException.class);
    }
}

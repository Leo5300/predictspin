package br.senai.predictspin.referencia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.maquina.Maquina;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.maquina.PontoMedicaoRepository;

class ReferenciaServiceTest {

    private static final Instant AGORA = Instant.parse("2026-11-18T12:00:00Z");

    private ReferenciaRepository repositorio;
    private MaquinaRepository maquinas;
    private Maquina maquina;

    @BeforeEach
    void preparar() {
        repositorio = mock(ReferenciaRepository.class);
        maquinas = mock(MaquinaRepository.class);
        maquina = mock(Maquina.class);
        when(maquina.getRotacoesNominaisRpm()).thenReturn(List.of(1120));
        when(maquinas.findById(1L)).thenReturn(Optional.of(maquina));
        when(repositorio.janelasDeEnsaios(1L, false)).thenReturn(List.of());
    }

    private ReferenciaService servico(PropriedadesReferencia p, ObjectMapper json) {
        return new ReferenciaService(repositorio, maquinas, mock(PontoMedicaoRepository.class), p, json,
                Clock.fixed(AGORA, ZoneOffset.UTC));
    }

    @Test
    void derivaDesligadaNaoLeJanelasDeUso() {
        var semDeriva = new PropriedadesReferencia(24, 0.05, 0.10, 0.98,
                new PropriedadesReferencia.Deriva(false, 7, 0.30));
        when(repositorio.versaoAtiva(1L, false)).thenReturn(Optional.empty());
        // a versão recém-gravada tem de ser lida de volta; sem ela, é erro de programa
        assertThatThrownBy(() -> servico(semDeriva, new ObjectMapper()).recalcular(1L, false, null))
                .isInstanceOf(IllegalStateException.class);
        verify(repositorio, never()).janelasDeDeriva(anyLong(), anyBoolean(), any());
        verify(repositorio).inserirCelulas(anyLong(), any());
    }

    @Test
    void falhaAoGravarOuLerJsonViraErroDePrograma() throws Exception {
        ObjectMapper quebrado = mock(ObjectMapper.class);
        when(quebrado.writeValueAsString(any())).thenThrow(new JsonProcessingException("x") { });
        assertThatThrownBy(() -> servico(FiltroQualidadeTest.P, quebrado).recalcular(1L, false, null))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("JSON");

        when(repositorio.contarVersoes(1L, false)).thenReturn(1L);
        when(repositorio.versoes(1L, false, 20, 0L)).thenReturn(List.of(new ReferenciaRepository.VersaoGravada(
                5L, 1, false, AGORA, null, 0, 0, "{quebrado", "{}", 0, 0)));
        assertThatThrownBy(() -> servico(FiltroQualidadeTest.P, new ObjectMapper()).versoes(1L, false, 0, 20))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("JSON");
        verify(repositorio, never()).inserirVersao(anyLong(), anyBoolean(), anyInt(), any(), any(), anyInt(),
                anyInt(), any(), any());
    }

    @Test
    void ativaGuardaACelulaEACalibracao() {
        var celula = new ReferenciaRepository.CelulaGravada(9L, 3L, "B", Medida.RMS_G, 1120, "T3", true, 7L, null,
                30, 0, 0.08, 0.004, 0.09, null, 0.004, true, "B-1", null);
        var insuficiente = new ReferenciaRepository.CelulaGravada(10L, 3L, "B", Medida.PICO_G, 1120, "T3", true, 7L,
                null, 3, 0, 0.2, 0.01, 0.3, null, 0.01, false, "B-1", null);
        ReferenciaAtiva ativa = new ReferenciaAtiva(4L, 2, List.of(celula, insuficiente));
        assertThat(ativa.versaoId()).isEqualTo(4L);
        assertThat(ativa.celulaDaReceita(3L, Medida.RMS_G, 1120, 7L, null)).contains(celula);
        assertThat(ativa.celulaDaReceita(3L, Medida.PICO_G, 1120, 7L, null)).isEmpty();
        assertThat(ativa.calibracao(3L)).isEqualTo("B-1");
        assertThat(ativa.calibracao(1L)).isNull();
    }
}

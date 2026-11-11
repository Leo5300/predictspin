package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import br.senai.predictspin.comum.CodigoId;
import br.senai.predictspin.comum.OperacaoProibidaException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.maquina.CanalRepository;
import br.senai.predictspin.maquina.DispositivoRepository;
import br.senai.predictspin.maquina.PontoMedicaoRepository;
import br.senai.predictspin.seguranca.DispositivoAutenticado;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao.MedidaPonto;

class IngestaoServiceTest {

    private static final Instant AGORA = Instant.parse("2026-11-10T12:00:00Z");
    private static final Instant MEDIDO = Instant.parse("2026-11-10T11:59:55Z");
    private static final long MAQUINA = 1L;
    private static final DispositivoAutenticado SIMULADOR = new DispositivoAutenticado(20L, "ps-sim-01", MAQUINA, true);

    private IngestaoRepository ingestao;
    private PontoMedicaoRepository pontos;
    private CanalRepository canais;
    private DispositivoRepository dispositivos;
    private EnsaioRepository ensaios;
    private IngestaoService servico;

    @BeforeEach
    void criar() {
        ingestao = mock(IngestaoRepository.class);
        pontos = mock(PontoMedicaoRepository.class);
        canais = mock(CanalRepository.class);
        dispositivos = mock(DispositivoRepository.class);
        ensaios = mock(EnsaioRepository.class);
        when(pontos.codigosAtivos(MAQUINA)).thenReturn(List.of(codigo("A", 11L), codigo("B", 12L), codigo("C", 13L)));
        when(canais.codigosAtivos(MAQUINA)).thenReturn(List.of(codigo("corrente_a", 31L), codigo("amb_temp_c", 32L)));
        when(ensaios.idAberto(MAQUINA, true)).thenReturn(Optional.empty());
        servico = new IngestaoService(ingestao, pontos, canais, dispositivos, ensaios,
                Clock.fixed(AGORA, ZoneOffset.UTC));
    }

    private static CodigoId codigo(String codigo, Long id) {
        return new CodigoId() {
            @Override
            public String getCodigo() {
                return codigo;
            }

            @Override
            public Long getId() {
                return id;
            }
        };
    }

    private static MedidaPonto medida(double rms) {
        return new MedidaPonto(rms, rms * 3, 3.0, rms / 2, rms / 4, rms / 8);
    }

    private static TelemetriaRequisicao requisicao(String dispositivo, Instant medidoEm, Map<String, Double> canais) {
        Map<String, MedidaPonto> pontos = new LinkedHashMap<>();
        pontos.put("A", medida(0.10));
        pontos.put("B", medida(0.20));
        pontos.put("C", medida(0.30));
        return new TelemetriaRequisicao(dispositivo, medidoEm, 1200.0, false, pontos, canais);
    }

    private void janelaNova(long id) {
        when(ingestao.inserirJanela(anyLong(), any(), any(), any(), anyDouble(), anyBoolean()))
                .thenReturn(Optional.of(id));
    }

    @Test
    void janelaNovaGravaPontosCanaisERegistraContato() {
        janelaNova(100L);

        var resultado = servico.receber(SIMULADOR, requisicao("ps-sim-01", MEDIDO, Map.of("corrente_a", 4.2)));

        assertThat(resultado.criada()).isTrue();
        assertThat(resultado.resposta().janelaId()).isEqualTo(100L);
        assertThat(resultado.resposta().duplicada()).isFalse();
        assertThat(resultado.resposta().ensaioId()).isNull();
        verify(dispositivos).registrarContato(20L, AGORA, AGORA.minusSeconds(10));
        verify(ingestao).inserirJanela(20L, null, MEDIDO, AGORA, 1200.0, false);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<IngestaoRepository.LinhaTelemetria>> linhas = ArgumentCaptor.forClass(List.class);
        verify(ingestao).inserirTelemetrias(eq(100L), linhas.capture());
        assertThat(linhas.getValue()).extracting(IngestaoRepository.LinhaTelemetria::pontoId)
                .containsExactly(11L, 12L, 13L);
        assertThat(linhas.getValue().get(1).rmsG()).isEqualTo(0.20);
        verify(ingestao).inserirLeituras(100L, Map.of(31L, 4.2));
    }

    @Test
    void semCanaisNaoGravaLeituraNemConsultaCanais() {
        janelaNova(101L);

        servico.receber(SIMULADOR, requisicao("ps-sim-01", MEDIDO, null));

        verify(ingestao, never()).inserirLeituras(anyLong(), any());
        verify(canais, never()).codigosAtivos(anyLong());
    }

    @Test
    void associaAoEnsaioAbertoDoMesmoTipo() {
        when(ensaios.idAberto(MAQUINA, true)).thenReturn(Optional.of(7L));
        janelaNova(102L);

        var resultado = servico.receber(SIMULADOR, requisicao("ps-sim-01", MEDIDO, null));

        assertThat(resultado.resposta().ensaioId()).isEqualTo(7L);
        verify(ingestao).inserirJanela(20L, 7L, MEDIDO, AGORA, 1200.0, false);
        verify(ensaios, never()).idAberto(MAQUINA, false);
    }

    @Test
    void reenvioDevolveAJanelaExistenteSemGravarDeNovo() {
        when(ingestao.inserirJanela(anyLong(), any(), any(), any(), anyDouble(), anyBoolean()))
                .thenReturn(Optional.empty());
        when(ingestao.buscarJanela(20L, MEDIDO))
                .thenReturn(Optional.of(new IngestaoRepository.JanelaExistente(55L, 9L)));

        var resultado = servico.receber(SIMULADOR, requisicao("ps-sim-01", MEDIDO, Map.of("corrente_a", 4.2)));

        assertThat(resultado.criada()).isFalse();
        assertThat(resultado.resposta().janelaId()).isEqualTo(55L);
        assertThat(resultado.resposta().duplicada()).isTrue();
        assertThat(resultado.resposta().ensaioId()).isEqualTo(9L);
        verify(ingestao, never()).inserirTelemetrias(anyLong(), any());
        verify(ingestao, never()).inserirLeituras(anyLong(), any());
    }

    @Test
    void medidoEmEhTruncadoParaMicrossegundos() {
        janelaNova(103L);
        Instant comNanos = Instant.parse("2026-11-10T11:59:55.123456789Z");

        var resultado = servico.receber(SIMULADOR, requisicao("ps-sim-01", comNanos, null));

        assertThat(resultado.resposta().medidoEm()).isEqualTo(Instant.parse("2026-11-10T11:59:55.123456Z"));
    }

    @Test
    void dispositivoDoCorpoDiferenteDoCabecalhoEhProibido() {
        assertThatThrownBy(() -> servico.receber(SIMULADOR, requisicao("ps-torno-01", MEDIDO, null)))
                .isInstanceOf(OperacaoProibidaException.class);
        verify(ingestao, never()).inserirJanela(anyLong(), any(), any(), any(), anyDouble(), anyBoolean());
        verify(dispositivos, never()).registrarContato(anyLong(), any(), any());
    }

    @Test
    void medidoEmMuitoNoFuturoEhRecusadoMasDentroDaToleranciaPassa() {
        assertThatThrownBy(() -> servico.receber(SIMULADOR,
                requisicao("ps-sim-01", AGORA.plusSeconds(301), null)))
                .isInstanceOf(RequisicaoInvalidaException.class)
                .hasMessageContaining("futuro");

        janelaNova(104L);
        assertThat(servico.receber(SIMULADOR, requisicao("ps-sim-01", AGORA.plusSeconds(300), null)).criada())
                .isTrue();
    }

    @Test
    void pontoDesconhecidoEhRecusadoComOsCodigosAceitos() {
        var req = requisicao("ps-sim-01", MEDIDO, null);
        req.pontos().put("Z", medida(0.1));

        assertThatThrownBy(() -> servico.receber(SIMULADOR, req))
                .isInstanceOf(RequisicaoInvalidaException.class)
                .hasMessageContaining("'pontos'")
                .hasMessageContaining("[Z]")
                .hasMessageContaining("[A, B, C]");
        verify(ingestao, never()).inserirJanela(anyLong(), any(), any(), any(), anyDouble(), anyBoolean());
    }

    @Test
    void canalDesconhecidoEhRecusado() {
        assertThatThrownBy(() -> servico.receber(SIMULADOR,
                requisicao("ps-sim-01", MEDIDO, Map.of("pressao_bar", 1.0))))
                .isInstanceOf(RequisicaoInvalidaException.class)
                .hasMessageContaining("'canais'")
                .hasMessageContaining("pressao_bar");
        verify(ingestao, never()).inserirJanela(anyLong(), any(), any(), any(), anyDouble(), anyBoolean());
    }
}

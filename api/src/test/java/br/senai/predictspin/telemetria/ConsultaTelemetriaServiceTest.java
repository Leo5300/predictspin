package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.maquina.Canal;
import br.senai.predictspin.maquina.Dispositivo;
import br.senai.predictspin.maquina.Grandeza;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.maquina.PapelPonto;
import br.senai.predictspin.maquina.PontoMedicao;
import br.senai.predictspin.maquina.PontoMedicaoRepository;
import br.senai.predictspin.telemetria.dto.TelemetriaPontoResposta;

class ConsultaTelemetriaServiceTest {

    private static final Instant AGORA = Instant.parse("2026-11-10T12:00:00Z");
    private static final Pageable PAGINA = PageRequest.of(0, 20);

    private TelemetriaRepository telemetrias;
    private JanelaRepository janelas;
    private LeituraRepository leituras;
    private PontoMedicaoRepository pontos;
    private MaquinaRepository maquinas;
    private ConsultaTelemetriaService servico;

    @BeforeEach
    void criar() {
        telemetrias = mock(TelemetriaRepository.class);
        janelas = mock(JanelaRepository.class);
        leituras = mock(LeituraRepository.class);
        pontos = mock(PontoMedicaoRepository.class);
        maquinas = mock(MaquinaRepository.class);
        when(pontos.existsById(11L)).thenReturn(true);
        when(maquinas.existsById(1L)).thenReturn(true);
        when(telemetrias.seriePorPonto(any(), any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));
        servico = new ConsultaTelemetriaService(telemetrias, janelas, leituras, pontos, maquinas,
                Clock.fixed(AGORA, ZoneOffset.UTC));
    }

    @Test
    void serieSemPeriodoUsaAsUltimas24Horas() {
        servico.seriePorPonto(11L, null, null, null, PAGINA);

        Instant fim = AGORA.plusSeconds(1);
        verify(telemetrias).seriePorPonto(11L, fim.minus(ConsultaTelemetriaService.PERIODO_PADRAO), fim, null, PAGINA);
    }

    @Test
    void serieRespeitaOPeriodoEOFiltroInformados() {
        Instant de = Instant.parse("2026-11-01T00:00:00Z");
        Instant ate = Instant.parse("2026-11-02T00:00:00Z");
        var linha = new TelemetriaPontoResposta(1L, de, de, 1200, false, null, "ps-sim-01", true,
                0.1, 0.3, 3.0, 0.05, 0.02, 0.01);
        when(telemetrias.seriePorPonto(11L, de, ate, true, PAGINA))
                .thenReturn(new PageImpl<>(List.of(linha), PAGINA, 1));

        var resposta = servico.seriePorPonto(11L, de, ate, true, PAGINA);

        assertThat(resposta.conteudo()).containsExactly(linha);
        assertThat(resposta.totalElementos()).isEqualTo(1);
    }

    @Test
    void serieSoComAteRecuaVinteEQuatroHorasAPartirDele() {
        Instant ate = Instant.parse("2026-11-05T00:00:00Z");
        servico.seriePorPonto(11L, null, ate, false, PAGINA);
        verify(telemetrias).seriePorPonto(11L, Instant.parse("2026-11-04T00:00:00Z"), ate, false, PAGINA);
    }

    @Test
    void periodoInvertidoEh400EPontoInexistenteEh404() {
        Instant de = Instant.parse("2026-11-02T00:00:00Z");
        assertThatThrownBy(() -> servico.seriePorPonto(11L, de, de, null, PAGINA))
                .isInstanceOf(RequisicaoInvalidaException.class);
        assertThatThrownBy(() -> servico.seriePorPonto(99L, null, null, null, PAGINA))
                .isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void ultimaJanelaJuntaPontosCanaisEEnsaio() {
        Janela janela = janela(500L, true);
        // os mocks são montados antes: não se cria mock no meio de outro when(...)
        List<Telemetria> medidas = List.of(
                telemetria(ponto(11L, "A", PapelPonto.ACIONAMENTO), 0.11),
                telemetria(ponto(12L, "B", PapelPonto.FERRAMENTA), 0.22));
        List<Leitura> valores = List.of(leitura("corrente_a", "A", Grandeza.CORRENTE, 4.5));
        when(janelas.maisRecentes(eq(1L), eq(true), any())).thenReturn(List.of(janela));
        when(telemetrias.daJanela(500L)).thenReturn(medidas);
        when(leituras.daJanela(500L)).thenReturn(valores);

        var resposta = servico.ultimaJanela(1L, true);

        assertThat(resposta.janelaId()).isEqualTo(500L);
        assertThat(resposta.dispositivo()).isEqualTo("ps-sim-01");
        assertThat(resposta.simulado()).isTrue();
        assertThat(resposta.segundosDesdeRecebimento()).isEqualTo(8);
        assertThat(resposta.rotacaoRpm()).isEqualTo(1200.0);
        assertThat(resposta.ensaioId()).isEqualTo(7L);
        assertThat(resposta.ensaioCodigo()).isEqualTo("TORNO-01-T1-00007");
        assertThat(resposta.pontos()).containsOnlyKeys("A", "B");
        assertThat(resposta.pontos().get("B").rmsG()).isEqualTo(0.22);
        assertThat(resposta.pontos().get("A").papel()).isEqualTo("acionamento");
        assertThat(resposta.canais().get("corrente_a").valor()).isEqualTo(4.5);
        assertThat(resposta.canais().get("corrente_a").grandeza()).isEqualTo("corrente");
    }

    @Test
    void ultimaJanelaSemEnsaioNemCanais() {
        Janela janela = janela(501L, false);
        when(janelas.maisRecentes(eq(1L), eq(null), any())).thenReturn(List.of(janela));
        when(telemetrias.daJanela(501L)).thenReturn(List.of());
        when(leituras.daJanela(501L)).thenReturn(List.of());

        var resposta = servico.ultimaJanela(1L, null);

        assertThat(resposta.ensaioId()).isNull();
        assertThat(resposta.ensaioCodigo()).isNull();
        assertThat(resposta.pontos()).isEmpty();
        assertThat(resposta.canais()).isEmpty();
    }

    @Test
    void ultimaJanelaSemDadoOuSemMaquinaEh404() {
        when(janelas.maisRecentes(eq(1L), any(), any())).thenReturn(List.of());
        assertThatThrownBy(() -> servico.ultimaJanela(1L, null)).isInstanceOf(RecursoNaoEncontradoException.class)
                .hasMessageContaining("Nenhuma janela");
        assertThatThrownBy(() -> servico.ultimaJanela(99L, null)).isInstanceOf(RecursoNaoEncontradoException.class);
    }

    private static Janela janela(long id, boolean comEnsaio) {
        Dispositivo dispositivo = mock(Dispositivo.class);
        when(dispositivo.getIdentificador()).thenReturn("ps-sim-01");
        when(dispositivo.isSimulado()).thenReturn(true);
        Janela janela = mock(Janela.class);
        when(janela.getId()).thenReturn(id);
        when(janela.getDispositivo()).thenReturn(dispositivo);
        when(janela.getMedidoEm()).thenReturn(AGORA.minusSeconds(10));
        when(janela.getRecebidoEm()).thenReturn(AGORA.minusSeconds(8));
        when(janela.getRotacaoRpm()).thenReturn(1200.0);
        if (comEnsaio) {
            Ensaio ensaio = mock(Ensaio.class);
            when(ensaio.getId()).thenReturn(7L);
            when(ensaio.getCodigo()).thenReturn("TORNO-01-T1-00007");
            when(janela.getEnsaio()).thenReturn(ensaio);
        }
        return janela;
    }

    private static PontoMedicao ponto(long id, String codigo, PapelPonto papel) {
        PontoMedicao ponto = mock(PontoMedicao.class);
        when(ponto.getId()).thenReturn(id);
        when(ponto.getCodigo()).thenReturn(codigo);
        when(ponto.getPapel()).thenReturn(papel);
        return ponto;
    }

    private static Telemetria telemetria(PontoMedicao ponto, double rms) {
        Telemetria t = mock(Telemetria.class);
        when(t.getPonto()).thenReturn(ponto);
        when(t.getRmsG()).thenReturn(rms);
        return t;
    }

    private static Leitura leitura(String codigo, String unidade, Grandeza grandeza, double valor) {
        Canal canal = mock(Canal.class);
        when(canal.getCodigo()).thenReturn(codigo);
        when(canal.getUnidade()).thenReturn(unidade);
        when(canal.getGrandeza()).thenReturn(grandeza);
        Leitura leitura = mock(Leitura.class);
        when(leitura.getCanal()).thenReturn(canal);
        when(leitura.getValor()).thenReturn(valor);
        return leitura;
    }
}

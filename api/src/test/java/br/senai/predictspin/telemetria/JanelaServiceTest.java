package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.maquina.Canal;
import br.senai.predictspin.maquina.Dispositivo;
import br.senai.predictspin.maquina.Grandeza;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.maquina.PapelPonto;
import br.senai.predictspin.maquina.PontoMedicao;

class JanelaServiceTest {

    private static final Instant AGORA = Instant.parse("2026-11-12T12:00:00Z");
    private static final long MAQUINA = 1L;

    private JanelaRepository janelas;
    private TelemetriaRepository telemetrias;
    private LeituraRepository leituras;
    private MaquinaRepository maquinas;
    private EnsaioRepository ensaios;
    private JanelaService servico;

    @BeforeEach
    void criar() {
        janelas = mock(JanelaRepository.class);
        telemetrias = mock(TelemetriaRepository.class);
        leituras = mock(LeituraRepository.class);
        maquinas = mock(MaquinaRepository.class);
        ensaios = mock(EnsaioRepository.class);
        when(maquinas.existsById(MAQUINA)).thenReturn(true);
        servico = new JanelaService(janelas, telemetrias, leituras, maquinas, ensaios,
                Clock.fixed(AGORA, ZoneOffset.UTC));
    }

    private static Janela janela(long id, Instant medidoEm, boolean simulado, Ensaio ensaio) {
        Dispositivo dispositivo = mock(Dispositivo.class);
        when(dispositivo.getIdentificador()).thenReturn(simulado ? "ps-sim-01" : "ps-torno-01");
        when(dispositivo.isSimulado()).thenReturn(simulado);
        Janela j = mock(Janela.class);
        when(j.getId()).thenReturn(id);
        when(j.getMedidoEm()).thenReturn(medidoEm);
        when(j.getRecebidoEm()).thenReturn(medidoEm.plusSeconds(1));
        when(j.getRotacaoRpm()).thenReturn(1120.0);
        when(j.getModo()).thenReturn(ModoJanela.NORMAL);
        when(j.getAmostras()).thenReturn(8000);
        when(j.getAmostrasEsperadas()).thenReturn(8000);
        when(j.getDispositivo()).thenReturn(dispositivo);
        when(j.getEnsaio()).thenReturn(ensaio);
        return j;
    }

    private static Telemetria telemetria(Janela j, String codigo, double rms) {
        PontoMedicao ponto = mock(PontoMedicao.class);
        when(ponto.getId()).thenReturn((long) codigo.charAt(0));
        when(ponto.getCodigo()).thenReturn(codigo);
        when(ponto.getPapel()).thenReturn(PapelPonto.ACIONAMENTO);
        when(ponto.getDescricao()).thenReturn("Ponto " + codigo);
        Telemetria t = mock(Telemetria.class);
        when(t.getJanela()).thenReturn(j);
        when(t.getPonto()).thenReturn(ponto);
        when(t.getRmsG()).thenReturn(rms);
        when(t.getPicoG()).thenReturn(rms * 3);
        return t;
    }

    private static Leitura leitura(Janela j, String codigo, double valor) {
        Canal canal = mock(Canal.class);
        when(canal.getCodigo()).thenReturn(codigo);
        when(canal.getUnidade()).thenReturn("A");
        when(canal.getGrandeza()).thenReturn(Grandeza.CORRENTE);
        Leitura l = mock(Leitura.class);
        when(l.getJanela()).thenReturn(j);
        when(l.getCanal()).thenReturn(canal);
        when(l.getValor()).thenReturn(valor);
        return l;
    }

    @Test
    void montaAsJanelasComPontosECanaisEmDuasConsultasParaAPaginaInteira() {
        Ensaio ensaio = mock(Ensaio.class);
        when(ensaio.getId()).thenReturn(9L);
        when(ensaio.getCodigo()).thenReturn("TORNO-01-T1-00009");
        Janela a = janela(10L, AGORA.minusSeconds(10), true, ensaio);
        Janela b = janela(11L, AGORA.minusSeconds(5), true, null);
        when(janelas.daMaquina(eq(MAQUINA), any(), any(), eq(true), eq(null), any()))
                .thenAnswer(i -> new PageImpl<>(List.of(b, a), i.getArgument(5), 2));
        List<Telemetria> pontos = List.of(telemetria(a, "A", 0.10), telemetria(a, "B", 0.20),
                telemetria(b, "A", 0.11));
        List<Leitura> canais = List.of(leitura(a, "corrente_a", 4.2));
        when(telemetrias.dasJanelas(List.of(11L, 10L))).thenReturn(pontos);
        when(leituras.dasJanelas(List.of(11L, 10L))).thenReturn(canais);

        var pagina = servico.daMaquina(MAQUINA, new JanelaService.Filtro(null, null, true, null, false), 0, 50);

        assertThat(pagina.totalElementos()).isEqualTo(2);
        var primeira = pagina.conteudo().get(0);
        assertThat(primeira.id()).isEqualTo(11L);
        assertThat(primeira.simulado()).isTrue();
        assertThat(primeira.dispositivo()).isEqualTo("ps-sim-01");
        assertThat(primeira.pontos()).containsOnlyKeys("A");
        assertThat(primeira.canais()).isEmpty();
        assertThat(primeira.ensaioId()).isNull();
        var segunda = pagina.conteudo().get(1);
        assertThat(segunda.pontos()).containsOnlyKeys("A", "B");
        assertThat(segunda.pontos().get("B").rmsG()).isEqualTo(0.20);
        assertThat(segunda.canais().get("corrente_a").valor()).isEqualTo(4.2);
        assertThat(segunda.canais().get("corrente_a").grandeza()).isEqualTo("corrente");
        assertThat(segunda.ensaioCodigo()).isEqualTo("TORNO-01-T1-00009");
        assertThat(segunda.amostras()).isEqualTo(8000);
    }

    @Test
    void semPeriodoUsaAsUltimas24HorasEAOrdemPedida() {
        when(janelas.daMaquina(any(), any(), any(), any(), any(), any()))
                .thenAnswer(i -> new PageImpl<>(List.<Janela>of(), i.getArgument(5), 0));
        ArgumentCaptor<Instant> de = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> ate = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Pageable> pagina = ArgumentCaptor.forClass(Pageable.class);

        var resposta = servico.daMaquina(MAQUINA,
                new JanelaService.Filtro(null, null, null, ModoJanela.RAPIDO, true), 2, 30);

        verify(janelas).daMaquina(eq(MAQUINA), de.capture(), ate.capture(), eq(null), eq(ModoJanela.RAPIDO),
                pagina.capture());
        assertThat(ate.getValue()).isEqualTo(AGORA.plusSeconds(1));
        assertThat(Duration.between(de.getValue(), ate.getValue())).isEqualTo(Duration.ofHours(24));
        assertThat(pagina.getValue().getPageNumber()).isEqualTo(2);
        assertThat(pagina.getValue().getPageSize()).isEqualTo(30);
        assertThat(pagina.getValue().getSort()).isEqualTo(Sort.by(Sort.Direction.ASC, "medidoEm"));
        assertThat(resposta.conteudo()).isEmpty();
        // página vazia não consulta pontos nem canais
        verify(telemetrias, never()).dasJanelas(any());
        verify(leituras, never()).dasJanelas(any());
    }

    @Test
    void periodoInvertidoEMaquinaInexistenteSaoRecusados() {
        var invertido = new JanelaService.Filtro(AGORA, AGORA.minusSeconds(1), null, null, false);
        assertThatThrownBy(() -> servico.daMaquina(MAQUINA, invertido, 0, 10))
                .isInstanceOf(RequisicaoInvalidaException.class);

        when(maquinas.existsById(99L)).thenReturn(false);
        var qualquer = new JanelaService.Filtro(null, null, null, null, false);
        assertThatThrownBy(() -> servico.daMaquina(99L, qualquer, 0, 10))
                .isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void janelasDoEnsaioRespeitamAPaginaEExigemOEnsaio() {
        Janela a = janela(10L, AGORA.minusSeconds(10), false, null);
        when(ensaios.existsById(7L)).thenReturn(true);
        when(janelas.doEnsaio(7L, PageRequest.of(1, 5))).thenReturn(new PageImpl<>(List.of(a), PageRequest.of(1, 5), 6));
        List<Telemetria> pontos = List.of(telemetria(a, "C", 0.05));
        when(telemetrias.dasJanelas(List.of(10L))).thenReturn(pontos);
        when(leituras.dasJanelas(List.of(10L))).thenReturn(List.of());

        var pagina = servico.doEnsaio(7L, 1, 5);

        assertThat(pagina.pagina()).isEqualTo(1);
        assertThat(pagina.totalPaginas()).isEqualTo(2);
        assertThat(pagina.conteudo().get(0).simulado()).isFalse();
        assertThat(pagina.conteudo().get(0).pontos()).containsOnlyKeys("C");

        when(ensaios.existsById(8L)).thenReturn(false);
        assertThatThrownBy(() -> servico.doEnsaio(8L, 0, 5)).isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void buscaUmaJanelaCompletaPeloId() {
        Janela a = janela(10L, AGORA.minusSeconds(10), false, null);
        when(janelas.comDispositivoEEnsaio(10L)).thenReturn(Optional.of(a));
        List<Telemetria> pontos = List.of(telemetria(a, "A", 0.3));
        when(telemetrias.dasJanelas(List.of(10L))).thenReturn(pontos);
        when(leituras.dasJanelas(List.of(10L))).thenReturn(List.of());
        when(janelas.comDispositivoEEnsaio(11L)).thenReturn(Optional.empty());

        assertThat(servico.buscar(10L)).get().satisfies(j -> {
            assertThat(j.id()).isEqualTo(10L);
            assertThat(j.pontos().get("A").picoG()).isEqualTo(0.3 * 3);
        });
        assertThat(servico.buscar(11L)).isEmpty();
    }
}

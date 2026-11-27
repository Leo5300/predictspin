package br.senai.predictspin.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import br.senai.predictspin.RelogioAjustavel;
import br.senai.predictspin.alarme.AvaliacaoRepository;
import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.comum.CodigoId;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.demo.dto.EstadoDemoResposta;
import br.senai.predictspin.maquina.Dispositivo;
import br.senai.predictspin.maquina.DispositivoRepository;
import br.senai.predictspin.maquina.Maquina;
import br.senai.predictspin.maquina.PontoMedicaoRepository;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaService;
import br.senai.predictspin.seguranca.DispositivoAutenticado;
import br.senai.predictspin.telemetria.JanelaRecebida;
import br.senai.predictspin.telemetria.ModoJanela;
import br.senai.predictspin.telemetria.RecepcaoTelemetriaService;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;

/** Estados, prazos e pausa do gerador, com relógio falso e sem banco. */
class DemoServiceTest {

    private static final Instant INICIO = Instant.parse("2026-11-27T13:00:00Z");

    private RelogioAjustavel relogio;
    private ReferenciaService referencias;
    private RecepcaoTelemetriaService recepcao;
    private DispositivoRepository dispositivos;
    private PontoMedicaoRepository pontos;
    private AvaliacaoRepository avaliacoes;
    private DemoService demo;

    @BeforeEach
    void preparar() {
        relogio = new RelogioAjustavel(INICIO);
        referencias = mock(ReferenciaService.class);
        recepcao = mock(RecepcaoTelemetriaService.class);
        dispositivos = mock(DispositivoRepository.class);
        pontos = mock(PontoMedicaoRepository.class);
        avaliacoes = mock(AvaliacaoRepository.class);

        Maquina maquina = mock(Maquina.class);
        when(maquina.getId()).thenReturn(1L);
        Dispositivo simulado = mock(Dispositivo.class);
        when(simulado.getId()).thenReturn(7L);
        when(simulado.getIdentificador()).thenReturn("ps-sim-01");
        when(simulado.isSimulado()).thenReturn(true);
        when(simulado.getMaquina()).thenReturn(maquina);
        when(dispositivos.buscarPorIdentificador("ps-sim-01")).thenReturn(Optional.of(simulado));
        when(pontos.codigosAtivos(1L)).thenReturn(List.of(codigo("A", 1), codigo("B", 2), codigo("C", 3)));
        when(avaliacoes.marchas(1L)).thenReturn(List.of(900, 1120, 1400));
        when(referencias.ativa(anyLong(), anyBoolean())).thenReturn(Optional.of(ReferenciaDeTeste.padrao()));

        demo = servico(true);
    }

    private DemoService servico(boolean habilitado) {
        var propriedades = new PropriedadesDemo(habilitado, 5, 300, 20, 1120, "ps-sim-01", 42, 500);
        var limites = new PropriedadesAlarme(3, 5, 15, 1, 15, 30, 0.5, 24, 10, 3, 24, List.of(15), 10080);
        return new DemoService(propriedades, limites, relogio, referencias, recepcao, dispositivos, pontos,
                avaliacoes);
    }

    private static CodigoId codigo(String codigo, long id) {
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

    private void avancar(long segundos) {
        relogio.avancar(Duration.ofSeconds(segundos));
    }

    private static JanelaRecebida janelaDe(boolean simulado) {
        return new JanelaRecebida(1L, simulado, 99L, INICIO, true, 1200.0, false, ModoJanela.NORMAL, null, null,
                null, null, null, Map.of(), List.of(), Map.of());
    }

    private List<TelemetriaRequisicao> enviadas(int vezes) {
        ArgumentCaptor<TelemetriaRequisicao> captor = ArgumentCaptor.forClass(TelemetriaRequisicao.class);
        verify(recepcao, times(vezes)).receber(any(DispositivoAutenticado.class), captor.capture(), eq(true));
        return captor.getAllValues();
    }

    @Test
    void comecaParadaENaoEnviaNada() {
        EstadoDemoResposta estado = demo.estado();
        assertThat(estado.nivel()).isEqualTo(NivelDemo.PARADA);
        assertThat(estado.habilitado()).isTrue();
        assertThat(estado.voltaNormalEmS()).isNull();
        assertThat(estado.referenciaOk()).isTrue();
        assertThat(estado.hardwareRealAtivo()).isFalse();
        demo.tick();
        avancar(60);
        demo.tick();
        verify(recepcao, never()).receber(any(), any(), anyBoolean());
    }

    @Test
    void enviaUmaJanelaPorIntervaloPelaChamadaDeServicoSemHttp() {
        demo.definir(NivelDemo.NORMAL, "id 1");
        demo.tick();
        enviadas(1);
        demo.tick();
        avancar(4);
        demo.tick();
        enviadas(1);
        avancar(1);
        demo.tick();
        List<TelemetriaRequisicao> janelas = enviadas(2);
        assertThat(janelas.get(1).medidoEm()).isEqualTo(INICIO.plusSeconds(5));
        assertThat(janelas.get(0).dispositivo()).isEqualTo("ps-sim-01");
        assertThat(janelas.get(0).medidoEm()).isEqualTo(INICIO);
    }

    @Test
    void atencaoVoltaSozinhaANormalDepoisDoPrazoEAvisa() {
        EstadoDemoResposta estado = demo.definir(NivelDemo.ATENCAO, "id 1");
        assertThat(estado.nivel()).isEqualTo(NivelDemo.ATENCAO);
        assertThat(estado.voltaNormalEmS()).isEqualTo(300L);
        assertThat(estado.mensagem()).contains("ATENÇÃO");
        avancar(100);
        assertThat(demo.estado().voltaNormalEmS()).isEqualTo(200L);
        avancar(199);
        assertThat(demo.estado().nivel()).isEqualTo(NivelDemo.ATENCAO);
        assertThat(demo.estado().voltaNormalEmS()).isEqualTo(1L);
        avancar(1);
        EstadoDemoResposta depois = demo.estado();
        assertThat(depois.nivel()).isEqualTo(NivelDemo.NORMAL);
        assertThat(depois.voltaNormalEmS()).isNull();
        assertThat(depois.mensagem()).contains("voltou sozinha a NORMAL");
        // e continua gerando, agora NORMAL
        demo.tick();
        assertThat(enviadas(1).get(0).pontos()).containsKeys("A", "B", "C");
    }

    @Test
    void alarmeTambemVoltaANormalSozinho() {
        demo.definir(NivelDemo.ALARME, "id 1");
        avancar(300);
        EstadoDemoResposta estado = demo.estado();
        assertThat(estado.nivel()).isEqualTo(NivelDemo.NORMAL);
        assertThat(estado.mensagem()).contains("ALARME").contains("voltou sozinho a NORMAL");
    }

    @Test
    void normalNaoVoltaNemTemContagem() {
        EstadoDemoResposta estado = demo.definir(NivelDemo.NORMAL, "id 1");
        assertThat(estado.voltaNormalEmS()).isNull();
        avancar(600);
        assertThat(demo.estado().nivel()).isEqualTo(NivelDemo.NORMAL);
    }

    @Test
    void paraSozinhoDepoisDe20MinutosSemComando() {
        demo.definir(NivelDemo.ALARME, "id 1");
        avancar(300);
        assertThat(demo.estado().nivel()).isEqualTo(NivelDemo.NORMAL);
        avancar(20 * 60 - 301);
        assertThat(demo.estado().nivel()).isEqualTo(NivelDemo.NORMAL);
        avancar(1);
        EstadoDemoResposta estado = demo.estado();
        assertThat(estado.nivel()).isEqualTo(NivelDemo.PARADA);
        assertThat(estado.mensagem()).contains("parou sozinha").contains("20 min");
        demo.tick();
        avancar(60);
        demo.tick();
        // nada saiu depois da parada
        verify(recepcao, never()).receber(any(), any(), anyBoolean());
    }

    @Test
    void novoComandoRenovaOPrazoDeParada() {
        demo.definir(NivelDemo.NORMAL, "id 1");
        avancar(19 * 60);
        demo.definir(NivelDemo.NORMAL, "id 1");
        avancar(19 * 60);
        assertThat(demo.estado().nivel()).isEqualTo(NivelDemo.NORMAL);
        avancar(60);
        assertThat(demo.estado().nivel()).isEqualTo(NivelDemo.PARADA);
    }

    @Test
    void hardwareRealPausaOGeradorEVoltaDepoisDe60Segundos() {
        demo.definir(NivelDemo.ALARME, "id 1");
        demo.tick();
        enviadas(1);

        demo.aoReceber(janelaDe(false));
        avancar(5);
        demo.tick();
        avancar(5);
        demo.tick();
        enviadas(1);
        EstadoDemoResposta pausado = demo.estado();
        assertThat(pausado.hardwareRealAtivo()).isTrue();
        assertThat(pausado.mensagem()).contains("Hardware real enviando");
        assertThat(pausado.nivel()).isEqualTo(NivelDemo.ALARME);

        avancar(49);
        assertThat(demo.estado().hardwareRealAtivo()).isTrue();
        avancar(1);
        assertThat(demo.estado().hardwareRealAtivo()).isFalse();
        demo.tick();
        enviadas(2);
    }

    @Test
    void janelaSimuladaNaoPausaOGerador() {
        demo.definir(NivelDemo.NORMAL, "id 1");
        demo.aoReceber(janelaDe(true));
        demo.tick();
        enviadas(1);
        assertThat(demo.estado().hardwareRealAtivo()).isFalse();
    }

    @Test
    void semReferenciaNaMarchaNaoGeraNadaENaoInventa() {
        when(referencias.ativa(anyLong(), anyBoolean())).thenReturn(Optional.empty());
        EstadoDemoResposta estado = demo.definir(NivelDemo.ALARME, "id 1");
        assertThat(estado.nivel()).isEqualTo(NivelDemo.PARADA);
        assertThat(estado.referenciaOk()).isFalse();
        assertThat(estado.mensagem()).contains("Sem referência simulada ativa para 1120 rpm");
        demo.tick();
        avancar(10);
        demo.tick();
        verify(recepcao, never()).receber(any(), any(), anyBoolean());
        assertThat(demo.estado().referenciaOk()).isFalse();
    }

    @Test
    void referenciaSemAMarchaDaDemonstracaoTambemNaoGera() {
        // referência só com a marcha 900: a 1120 não há célula suficiente
        ReferenciaAtiva outra = new ReferenciaAtiva(2, 1, List.of());
        when(referencias.ativa(anyLong(), anyBoolean())).thenReturn(Optional.of(outra));
        EstadoDemoResposta estado = demo.definir(NivelDemo.ATENCAO, "id 1");
        assertThat(estado.nivel()).isEqualTo(NivelDemo.PARADA);
        assertThat(estado.referenciaOk()).isFalse();
        assertThat(estado.mensagem()).contains("ponto A no T1");
    }

    @Test
    void pararDeixaDeEnviarEPodeSerPedidoComReferenciaFaltando() {
        demo.definir(NivelDemo.NORMAL, "id 1");
        demo.tick();
        enviadas(1);
        when(referencias.ativa(anyLong(), anyBoolean())).thenReturn(Optional.empty());
        assertThat(demo.definir(NivelDemo.PARADA, "id 1").nivel()).isEqualTo(NivelDemo.PARADA);
        avancar(10);
        demo.tick();
        enviadas(1);
    }

    @Test
    void desligadaAsRotasDizem404ENadaEEnviado() {
        DemoService desligada = servico(false);
        assertThatThrownBy(desligada::estado).isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> desligada.definir(NivelDemo.ALARME, "id 1"))
                .isInstanceOf(RecursoNaoEncontradoException.class);
        desligada.passo();
        verify(recepcao, never()).receber(any(), any(), anyBoolean());
        assertThat(desligada.habilitado()).isFalse();
    }
}

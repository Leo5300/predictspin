package br.senai.predictspin.alarme;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import br.senai.predictspin.alarme.MaquinaDeEstados.CondicaoInstrumento;
import br.senai.predictspin.alarme.MaquinaDeEstados.PassoInstrumento;

class MaquinaDeEstadosTest {

    static final PropriedadesAlarme P = new PropriedadesAlarme(3, 5, 15, 1, 15, 30, 0.5, 24, 10, 3, 24,
            java.util.List.of(15, 60, 240, 1440), 10_080);
    private static final Instant T0 = Instant.parse("2026-11-18T10:00:00Z");
    private static final CondicaoInstrumento OK = new CondicaoInstrumento(false, false, false);

    private EstadoPonto e;
    private int segundos;

    @BeforeEach
    void preparar() {
        e = new EstadoPonto(1, true);
        segundos = 0;
    }

    /** Uma janela de 5 s com o z dado. */
    private MaquinaDeEstados.Transicao janela(Double z) {
        return janela(z, 5);
    }

    private MaquinaDeEstados.Transicao janela(Double z, int duracao) {
        Instant t = T0.plusSeconds(segundos);
        segundos += duracao;
        var transicao = MaquinaDeEstados.passo(e, t, duracao, z, P);
        e.ultimoMedidoEm = t;
        return transicao;
    }

    @Test
    void entraSoDepoisDoAtraso() {
        assertThat(janela(4.0).mudou()).isFalse();
        assertThat(janela(4.0).mudou()).isFalse();
        // terceira janela de 5 s: 15 s seguidos
        var t = janela(4.0);
        assertThat(t.mudou()).isTrue();
        assertThat(t.novo()).isEqualTo(Nivel.ATENCAO);
    }

    @Test
    void batidaIsoladaNaoDisparaNada() {
        janela(9.0);
        janela(1.0);
        janela(9.0);
        janela(1.0);
        assertThat(e.estado()).isEqualTo(Nivel.NORMAL);
    }

    @Test
    void modoRapidoContaSegundosNaoJanelas() {
        for (int i = 0; i < 14; i++) {
            assertThat(janela(6.0, 1).novo()).isEqualTo(Nivel.NORMAL);
        }
        assertThat(janela(6.0, 1).novo()).isEqualTo(Nivel.ALARME);
        assertThat(e.emAlarmeDesde()).isNotNull();
    }

    @Test
    void sobeDeAtencaoParaAlarmeEDesceComHisterese() {
        janela(4.0);
        janela(4.0);
        janela(4.0);
        assertThat(e.estado()).isEqualTo(Nivel.ATENCAO);
        janela(6.0);
        janela(6.0);
        assertThat(janela(6.0).novo()).isEqualTo(Nivel.ALARME);
        // 4,5 ainda está acima de 5 − 1: não começa a sair
        janela(4.5);
        janela(4.5);
        janela(4.5);
        janela(4.5);
        assertThat(e.estado()).isEqualTo(Nivel.ALARME);
        // 3,5 está abaixo de 4 por 15 s e ainda na faixa de ATENÇÃO: desce para ATENÇÃO
        janela(3.5);
        janela(3.5);
        assertThat(janela(3.5).novo()).isEqualTo(Nivel.ATENCAO);
        assertThat(e.emAlarmeDesde()).isNull();
        // 2,5 está acima de 3 − 1: continua em ATENÇÃO
        janela(2.5);
        janela(2.5);
        janela(2.5);
        assertThat(e.estado()).isEqualTo(Nivel.ATENCAO);
        janela(1.0);
        janela(1.0);
        assertThat(janela(1.0).novo()).isEqualTo(Nivel.NORMAL);
    }

    @Test
    void deAlarmeDiretoParaNormal() {
        janela(6.0);
        janela(6.0);
        janela(6.0);
        janela(0.0);
        janela(0.0);
        assertThat(janela(0.0).novo()).isEqualTo(Nivel.NORMAL);
    }

    @Test
    void janelaSemAvaliacaoAjudaASair() {
        janela(4.0);
        janela(4.0);
        janela(4.0);
        janela(null);
        janela(null);
        assertThat(janela(null).novo()).isEqualTo(Nivel.NORMAL);
    }

    @Test
    void lacunaZeraOsTemporizadores() {
        janela(4.0);
        janela(4.0);
        segundos += 60;
        assertThat(janela(4.0).novo()).isEqualTo(Nivel.NORMAL);
        janela(4.0);
        assertThat(janela(4.0).novo()).isEqualTo(Nivel.ATENCAO);
    }

    private PassoInstrumento instrumento(CondicaoInstrumento c) {
        Instant t = T0.plusSeconds(segundos);
        segundos += 5;
        return MaquinaDeEstados.passoInstrumento(e, t, 5, c, P);
    }

    @Test
    void pontoAusentePor30sAbreInstrumentoENormaliza() {
        CondicaoInstrumento ausente = new CondicaoInstrumento(true, false, false);
        for (int i = 0; i < 5; i++) {
            assertThat(instrumento(ausente).abriu()).isFalse();
        }
        PassoInstrumento abriu = instrumento(ausente);
        assertThat(abriu.abriu()).isTrue();
        assertThat(abriu.motivo()).contains("sumiu do envio");
        assertThat(instrumento(ausente).abriu()).isFalse();
        assertThat(e.instrumentoAtivo()).isTrue();
        instrumento(OK);
        instrumento(OK);
        assertThat(instrumento(OK).normalizou()).isTrue();
        assertThat(e.instrumentoAtivo()).isFalse();
        assertThat(instrumento(OK)).isEqualTo(PassoInstrumento.NADA);
    }

    @Test
    void sinalSumidoPor30s() {
        CondicaoInstrumento baixo = new CondicaoInstrumento(false, true, false);
        PassoInstrumento ultimo = null;
        for (int i = 0; i < 6; i++) {
            ultimo = instrumento(baixo);
        }
        assertThat(ultimo.abriu()).isTrue();
        assertThat(ultimo.motivo()).contains("sinal sumiu");
    }

    @Test
    void falhaDeAmostragemSoAbreSeRepetir() {
        CondicaoInstrumento falha = new CondicaoInstrumento(false, false, true);
        assertThat(instrumento(falha).abriu()).isFalse();
        PassoInstrumento segunda = instrumento(falha);
        assertThat(segunda.abriu()).isTrue();
        assertThat(segunda.motivo()).contains("saturação");
        // a condição sumiu e voltou antes de 15 s: continua aberto
        instrumento(OK);
        assertThat(instrumento(falha)).isEqualTo(PassoInstrumento.NADA);
    }

    @Test
    void nivelBrutoELimites() {
        assertThat(P.nivelBruto(null)).isEqualTo(Nivel.NORMAL);
        assertThat(P.nivelBruto(3.0)).isEqualTo(Nivel.ATENCAO);
        assertThat(P.nivelBruto(5.0)).isEqualTo(Nivel.ALARME);
        assertThat(P.limite(Nivel.ALARME)).isEqualTo(5);
        assertThat(Nivel.pior(Nivel.ATENCAO, Nivel.NORMAL)).isEqualTo(Nivel.ATENCAO);
        assertThat(Nivel.doCodigo(2)).isEqualTo(Nivel.ALARME);
        assertThat(Situacao.doCodigo(3)).isEqualTo(Situacao.CALIBRACAO_DIFERENTE);
        assertThat(Situacao.NAO_AVALIAVEL.valor()).isEqualTo("nao_avaliavel");
        assertThat(Nivel.ATENCAO.valor()).isEqualTo("atencao");
    }
}

package br.senai.predictspin.referencia;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import br.senai.predictspin.telemetria.ModoJanela;

class FiltroQualidadeTest {

    static final PropriedadesReferencia P = new PropriedadesReferencia(24, 0.05, 0.10, 0.98,
            new PropriedadesReferencia.Deriva(true, 7, 0.30));
    static final List<Integer> MARCHAS = List.of(45, 71, 90, 112, 140, 180, 224, 265, 280, 355, 450, 560, 710, 900,
            1120, 1400, 1800, 2240);

    private static FiltroQualidade.Entrada boa(double rotacao) {
        return new FiltroQualidade.Entrada(false, ModoJanela.NORMAL, 8000, 8000, rotacao, false, false);
    }

    @Test
    void janelaBoaNaoTemMotivo() {
        assertThat(FiltroQualidade.motivos(boa(1120), MARCHAS, P)).isEmpty();
        assertThat(FiltroQualidade.motivos(boa(0), MARCHAS, P)).isEmpty();
        // firmware antigo, sem contagem de amostras
        assertThat(FiltroQualidade.motivos(new FiltroQualidade.Entrada(false, ModoJanela.NORMAL, null, null, 1120,
                false, false), MARCHAS, P)).isEmpty();
    }

    @Test
    void cadaMotivoEhDetectado() {
        assertThat(FiltroQualidade.motivos(new FiltroQualidade.Entrada(true, ModoJanela.RAPIDO, 7000, 8000, 1260,
                true, true), MARCHAS, P)).containsExactlyInAnyOrder(MotivoExclusao.SATUROU, MotivoExclusao.MODO_RAPIDO,
                MotivoExclusao.AMOSTRAS_FALTANDO, MotivoExclusao.FORA_DA_MARCHA, MotivoExclusao.ORDENS_ZERADAS,
                MotivoExclusao.ENSAIO_DESCARTADO);
    }

    @Test
    void ordensZeradasSoContamComRotacao() {
        assertThat(FiltroQualidade.motivos(new FiltroQualidade.Entrada(false, ModoJanela.NORMAL, 8000, 8000, 0,
                true, false), MARCHAS, P)).isEmpty();
    }

    @Test
    void amostrasNoLimiteAindaSaoBoas() {
        assertThat(FiltroQualidade.amostrasFaltando(7840, 8000, 0.98)).isFalse();
        assertThat(FiltroQualidade.amostrasFaltando(7839, 8000, 0.98)).isTrue();
        assertThat(FiltroQualidade.amostrasFaltando(7000, 0, 0.98)).isFalse();
        assertThat(FiltroQualidade.amostrasFaltando(7000, null, 0.98)).isFalse();
    }

    @Test
    void marchaEhANominalMaisProxima() {
        assertThat(FiltroQualidade.marcha(1200, MARCHAS)).isEqualTo(1120);
        assertThat(FiltroQualidade.marcha(0, MARCHAS)).isZero();
        assertThat(FiltroQualidade.marcha(272.5, List.of(265, 280))).isEqualTo(265);
        assertThat(FiltroQualidade.marcha(1187.4, List.of())).isEqualTo(1187);
    }

    @Test
    void foraDaMarchaUsaTolerancia() {
        assertThat(FiltroQualidade.foraDaMarcha(1232, MARCHAS, 0.10)).isFalse();
        assertThat(FiltroQualidade.foraDaMarcha(1240, MARCHAS, 0.10)).isTrue();
        assertThat(FiltroQualidade.foraDaMarcha(1240, List.of(), 0.10)).isFalse();
        assertThat(FiltroQualidade.foraDaMarcha(0, MARCHAS, 0.10)).isFalse();
    }

    @Test
    void motivosDoFiltroSaoOsSeisPrimeiros() {
        assertThat(MotivoExclusao.ENSAIO_DESCARTADO.doFiltro()).isTrue();
        assertThat(MotivoExclusao.CONDICAO_NAO_NORMAL.doFiltro()).isFalse();
        assertThat(MotivoExclusao.CALIBRACAO_ANTIGA.valor()).isEqualTo("calibracao_antiga");
    }
}

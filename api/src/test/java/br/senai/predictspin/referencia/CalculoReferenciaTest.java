package br.senai.predictspin.referencia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import br.senai.predictspin.referencia.ReferenciaRepository.LinhaJanela;
import br.senai.predictspin.referencia.ReferenciaRepository.NovaCelula;
import br.senai.predictspin.telemetria.ModoJanela;

class CalculoReferenciaTest {

    private static final PropriedadesReferencia P = FiltroQualidadeTest.P;
    private static final List<Integer> MARCHAS = FiltroQualidadeTest.MARCHAS;
    private static final Instant T = Instant.parse("2026-11-18T10:00:00Z");
    private static final long A = 1;
    private static final long B = 2;

    private long proximaJanela = 1;

    /** Janela de ensaio num ponto, com RMS dado e as outras medidas derivadas dele. */
    private LinhaJanela linha(long ponto, String etapa, String condicao, double rpm, double rms, Long material,
                              Long ferramenta, String calibracao, int segundos) {
        String codigo = ponto == A ? "A" : "B";
        return new LinhaJanela(proximaJanela++, T.plusSeconds(segundos), rpm, false, ModoJanela.NORMAL, 8000, 8000,
                "fw-1", calibracao == null ? null : "{\"" + codigo + "\":\"" + calibracao + "\"}", ponto, codigo,
                etapa, condicao, false, material, ferramenta,
                new double[] {rms, rms * 3, 3.0, rms * 0.6, rms * 0.2, rms * 0.1}, rms * 10);
    }

    private List<LinhaJanela> serie(long ponto, String etapa, double rpm, int n, double base, Long material,
                                    Long ferramenta) {
        List<LinhaJanela> linhas = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            linhas.add(linha(ponto, etapa, "normal", rpm, base + 0.001 * (i % 5), material, ferramenta, null,
                    i * 5));
        }
        return linhas;
    }

    private static Optional<NovaCelula> celula(CalculoReferencia.Resultado r, long ponto, Medida medida, int marcha,
                                               String etapa, boolean receita) {
        return r.celulas().stream().filter(c -> c.pontoId() == ponto && c.medida() == medida
                && c.marchaRpm() == marcha && c.etapa().equals(etapa) && c.porReceita() == receita).findFirst();
    }

    @Test
    void celulaComPoucasJanelasFicaInsuficiente() {
        var r = CalculoReferencia.calcular(serie(A, "T1", 1120, 10, 0.10, null, null), List.of(), MARCHAS, P);
        NovaCelula rms = celula(r, A, Medida.RMS_G, 1120, "T1", false).orElseThrow();
        assertThat(rms.n()).isEqualTo(10);
        assertThat(rms.suficiente()).isFalse();
        assertThat(r.janelasUsadas()).isEqualTo(10);
        assertThat(r.pisoMedido()).isFalse();
    }

    @Test
    void sigmaZeroUsaFracaoDaMediana() {
        List<LinhaJanela> iguais = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            iguais.add(linha(A, "T1", "normal", 1120, 0.10, null, null, null, i * 5));
        }
        NovaCelula rms = celula(CalculoReferencia.calcular(iguais, List.of(), MARCHAS, P), A, Medida.RMS_G, 1120,
                "T1", false).orElseThrow();
        assertThat(rms.sigma()).isZero();
        assertThat(rms.sigmaEfetivo()).isCloseTo(0.005, within(1e-12));
        assertThat(rms.suficiente()).isTrue();
    }

    @Test
    void pisoDeRuidoVemDoT0DoMesmoPonto() {
        List<LinhaJanela> linhas = new ArrayList<>(serie(A, "T0", 0, 30, 0.02, null, null));
        linhas.addAll(serie(A, "T1", 1120, 30, 0.021, null, null));
        var r = CalculoReferencia.calcular(linhas, List.of(), MARCHAS, P);
        assertThat(r.pisoMedido()).isTrue();
        NovaCelula t1 = celula(r, A, Medida.RMS_G, 1120, "T1", false).orElseThrow();
        assertThat(t1.pisoRuido()).isCloseTo(0.024, within(1e-9));
        // em marcha baixa o σ seria minúsculo: o piso manda
        assertThat(t1.sigmaEfetivo()).isEqualTo(t1.pisoRuido());
        // curtose e ordens não têm piso; T0 não tem ordens
        assertThat(celula(r, A, Medida.CURTOSE, 1120, "T1", false).orElseThrow().pisoRuido()).isNull();
        assertThat(celula(r, A, Medida.O1X, 0, "T0", false)).isEmpty();
    }

    @Test
    void receitaGeraCelulaPropriaEAGenerica() {
        List<LinhaJanela> linhas = new ArrayList<>(serie(B, "T3", 1120, 30, 0.08, 7L, 9L));
        linhas.addAll(serie(B, "T3", 1120, 30, 0.12, null, null));
        var r = CalculoReferencia.calcular(linhas, List.of(), MARCHAS, P);
        NovaCelula receita = celula(r, B, Medida.RMS_G, 1120, "T3", true).orElseThrow();
        assertThat(receita.materialId()).isEqualTo(7L);
        assertThat(receita.ferramentaId()).isEqualTo(9L);
        assertThat(receita.n()).isEqualTo(30);
        NovaCelula generica = celula(r, B, Medida.RMS_G, 1120, "T3", false).orElseThrow();
        assertThat(generica.n()).isEqualTo(60);
        assertThat(generica.materialId()).isNull();
    }

    @Test
    void condicaoNaoNormalET2FicamDeFora() {
        List<LinhaJanela> linhas = new ArrayList<>(serie(A, "T1", 1120, 3, 0.10, null, null));
        linhas.add(linha(A, "T1", "avanco_excessivo", 1120, 0.5, null, null, null, 100));
        linhas.add(linha(A, "T1", "sensor_solto", 1120, 0.5, null, null, null, 105));
        linhas.add(linha(A, "T2", "normal", 1120, 0.5, null, null, null, 110));
        var r = CalculoReferencia.calcular(linhas, List.of(), MARCHAS, P);
        assertThat(r.excluidas()).containsEntry(MotivoExclusao.CONDICAO_NAO_NORMAL, 2)
                .containsEntry(MotivoExclusao.ETAPA_T2, 1);
        assertThat(celula(r, A, Medida.RMS_G, 1120, "T1", false).orElseThrow().n()).isEqualTo(3);
    }

    @Test
    void janelaRuimContaCadaMotivo() {
        LinhaJanela rapida = new LinhaJanela(99, T, 1120, true, ModoJanela.RAPIDO, 8000, 8000, null, null, A, "A",
                "T1", "normal", false, null, null, new double[] {0.1, 0.3, 3, 0, 0, 0}, null);
        var r = CalculoReferencia.calcular(List.of(rapida), List.of(), MARCHAS, P);
        assertThat(r.excluidas()).containsEntry(MotivoExclusao.SATUROU, 1).containsEntry(MotivoExclusao.MODO_RAPIDO, 1)
                .containsEntry(MotivoExclusao.ORDENS_ZERADAS, 1);
        assertThat(r.celulas()).isEmpty();
        assertThat(r.janelasUsadas()).isZero();
    }

    @Test
    void calibracaoAntigaFicaDeFora() {
        List<LinhaJanela> linhas = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            linhas.add(linha(A, "T1", "normal", 1120, 0.10, null, null, "A-1", i * 5));
        }
        for (int i = 5; i < 8; i++) {
            linhas.add(linha(A, "T1", "normal", 1120, 0.11, null, null, "A-2", i * 5));
        }
        var r = CalculoReferencia.calcular(linhas, List.of(), MARCHAS, P);
        assertThat(r.excluidas()).containsEntry(MotivoExclusao.CALIBRACAO_ANTIGA, 5);
        NovaCelula rms = celula(r, A, Medida.RMS_G, 1120, "T1", false).orElseThrow();
        assertThat(rms.n()).isEqualTo(3);
        assertThat(rms.calibracao()).isEqualTo("A-2");
        assertThat(rms.firmwareVersoes()).isEqualTo("fw-1");
        assertThat(CalculoReferencia.calibracaoDoPonto("{quebrado", "A")).isNull();
    }

    @Test
    void derivaLimitadaA30PorCento() {
        List<LinhaJanela> ensaio = serie(A, "T1", 1120, 28, 0.10, null, null);
        List<LinhaJanela> deriva = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            deriva.add(linha(A, "T1", "normal", 1120, 0.105, null, null, null, 1000 - i));
        }
        // deriva nunca vai para célula que não existe nos ensaios
        deriva.add(linha(A, "T1", "normal", 450, 0.105, null, null, null, 2000));
        var r = CalculoReferencia.calcular(ensaio, deriva, MARCHAS, P);
        NovaCelula rms = celula(r, A, Medida.RMS_G, 1120, "T1", false).orElseThrow();
        // d ≤ 0,3 × (28 + d) → d ≤ 12
        assertThat(rms.nDeriva()).isEqualTo(12);
        assertThat(rms.n()).isEqualTo(40);
        assertThat(r.janelasDeriva()).isEqualTo(12);
        assertThat(celula(r, A, Medida.RMS_G, 450, "T1", false)).isEmpty();
    }

    @Test
    void derivaDesligadaNaoEntra() {
        var semDeriva = new PropriedadesReferencia(24, 0.05, 0.10, 0.98,
                new PropriedadesReferencia.Deriva(false, 7, 0.30));
        var r = CalculoReferencia.calcular(serie(A, "T1", 1120, 28, 0.10, null, null),
                List.of(linha(A, "T1", "normal", 1120, 0.105, null, null, null, 1000)), MARCHAS, semDeriva);
        assertThat(r.janelasDeriva()).isZero();
    }

    @Test
    void derivaNuncaEntraEmReceitaNemComCalibracaoDiferente() {
        List<LinhaJanela> ensaio = serie(B, "T3", 1120, 30, 0.08, 7L, null);
        List<LinhaJanela> deriva = List.of(linha(B, "T3", "normal", 1120, 0.09, null, null, "B-9", 900),
                linha(B, "T3", "normal", 1120, 0.09, null, null, null, 905));
        var r = CalculoReferencia.calcular(ensaio, deriva, MARCHAS, P);
        assertThat(celula(r, B, Medida.RMS_G, 1120, "T3", true).orElseThrow().nDeriva()).isZero();
        assertThat(celula(r, B, Medida.RMS_G, 1120, "T3", false).orElseThrow().nDeriva()).isEqualTo(1);
    }

    @Test
    void janelaSemVelocidadeNaoGeraCelulaDeVelocidade() {
        List<LinhaJanela> linhas = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            linhas.add(new LinhaJanela(500 + i, T.plusSeconds(i * 5L), 1120, false, ModoJanela.NORMAL, null, null,
                    null, null, A, "A", "T1", "normal", false, null, null,
                    new double[] {0.1, 0.3, 3, 0.06, 0.02, 0.01}, null));
        }
        var r = CalculoReferencia.calcular(linhas, List.of(), MARCHAS, P);
        assertThat(celula(r, A, Medida.VEL_RMS_MM_S, 1120, "T1", false)).isEmpty();
        assertThat(celula(r, A, Medida.RMS_G, 1120, "T1", false)).isPresent();
    }

    @Test
    void limiteDaDeriva() {
        assertThat(CalculoReferencia.limiteDeriva(70, 0.30)).isEqualTo(30);
        assertThat(CalculoReferencia.limiteDeriva(70, 0)).isZero();
        assertThat(CalculoReferencia.limiteDeriva(70, 1)).isEqualTo(Integer.MAX_VALUE);
    }
}

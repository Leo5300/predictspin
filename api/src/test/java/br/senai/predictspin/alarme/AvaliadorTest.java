package br.senai.predictspin.alarme;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import org.junit.jupiter.api.Test;

import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaRepository.CelulaGravada;

class AvaliadorTest {

    static final long A = 1;

    /** Célula com σ efetivo = 10% da mediana. */
    static CelulaGravada celula(long ponto, Medida medida, int marcha, String etapa, boolean receita, Long material,
                                double mediana, boolean suficiente) {
        return new CelulaGravada(0, ponto, "A", medida, marcha, etapa, receita, material, null, suficiente ? 30 : 3, 0,
                mediana, mediana * 0.1, mediana * 1.2, null, mediana * 0.1, suficiente, "A-1", "fw");
    }

    /** Todas as medidas de um ponto numa etapa, com mediana base (ordens e curtose proporcionais). */
    static List<CelulaGravada> etapa(long ponto, int marcha, String etapa, boolean receita, Long material,
                                     double base) {
        List<CelulaGravada> lista = new ArrayList<>();
        for (Medida m : Medida.values()) {
            if (m.ordem() && marcha == 0) {
                continue;
            }
            lista.add(celula(ponto, m, marcha, etapa, receita, material, base, true));
        }
        return lista;
    }

    static Function<Medida, Double> todos(double valor) {
        return m -> valor;
    }

    private static Avaliador.Contexto ctx(int marcha, String etapa, Long material) {
        return new Avaliador.Contexto(marcha, false, etapa, material, null, "A-1");
    }

    private static ReferenciaAtiva ref(List<CelulaGravada> celulas) {
        return new ReferenciaAtiva(1, 1, celulas);
    }

    @Test
    void ensaioT1ET2UsamOT1() {
        ReferenciaAtiva ref = ref(etapa(A, 1120, "T1", false, null, 0.10));
        Avaliador.Resultado r = Avaliador.avaliar(ref, A, ctx(1120, "T2", null), todos(0.14), false);
        assertThat(r.situacao()).isEqualTo(Situacao.AVALIADA);
        assertThat(r.etapaRef()).isEqualTo("T1");
        assertThat(r.zMax()).isCloseTo(4.0, within(1e-9));
        assertThat(r.z()).containsKey(Medida.CURTOSE);
        assertThat(Avaliador.avaliar(ref, A, ctx(1120, "T1", null), todos(0.10), false).zMax()).isZero();
    }

    @Test
    void t3UsaAReceitaOuAGenerica() {
        List<CelulaGravada> celulas = new ArrayList<>(etapa(A, 1120, "T3", false, null, 0.10));
        celulas.addAll(etapa(A, 1120, "T3", true, 7L, 0.20));
        ReferenciaAtiva ref = ref(celulas);
        Avaliador.Resultado receita = Avaliador.avaliar(ref, A, ctx(1120, "T3", 7L), todos(0.20), false);
        assertThat(receita.generica()).isFalse();
        assertThat(receita.zMax()).isZero();
        Avaliador.Resultado outra = Avaliador.avaliar(ref, A, ctx(1120, "T3", 8L), todos(0.20), false);
        assertThat(outra.generica()).isTrue();
        assertThat(outra.zMax()).isCloseTo(10.0, within(1e-9));
        assertThat(Avaliador.avaliar(ref, A, ctx(1120, "T3", null), todos(0.10), false).generica()).isTrue();
    }

    @Test
    void ensaioT0SemCelulaFicaSemReferencia() {
        ReferenciaAtiva ref = ref(etapa(A, 1120, "T1", false, null, 0.10));
        assertThat(Avaliador.avaliar(ref, A, ctx(0, "T0", null), todos(0.01), false).situacao())
                .isEqualTo(Situacao.SEM_REFERENCIA);
    }

    @Test
    void semEnsaioParadoUsaT0SemOrdens() {
        ReferenciaAtiva ref = ref(etapa(A, 0, "T0", false, null, 0.01));
        Avaliador.Resultado r = Avaliador.avaliar(ref, A, ctx(0, null, null), todos(0.01), false);
        assertThat(r.etapaRef()).isEqualTo("T0");
        assertThat(r.z()).doesNotContainKey(Medida.O1X);
    }

    @Test
    void semEnsaioGirandoFicaComAInterpretacaoMaisNormal() {
        List<CelulaGravada> celulas = new ArrayList<>(etapa(A, 1120, "T1", false, null, 0.10));
        celulas.addAll(etapa(A, 1120, "T3", false, null, 0.20));
        ReferenciaAtiva ref = ref(celulas);
        // 0,2 é corte normal: z 10 contra o vazio, 0 contra o corte
        Avaliador.Resultado corte = Avaliador.avaliar(ref, A, ctx(1120, null, null), todos(0.20), false);
        assertThat(corte.etapaRef()).isEqualTo("T3");
        assertThat(corte.generica()).isFalse();
        assertThat(corte.zMax()).isZero();
        // 0,1 é vazio normal: z 0 contra o vazio e −5 contra o corte; fica com o menor pior z (o corte),
        // e o estado é NORMAL do mesmo jeito (só desvio para cima conta)
        Avaliador.Resultado vazio = Avaliador.avaliar(ref, A, ctx(1120, null, null), todos(0.10), false);
        assertThat(vazio.etapaRef()).isEqualTo("T3");
        assertThat(vazio.zMax()).isCloseTo(-5.0, within(1e-9));
        // entre os dois: acima do vazio (z 5), abaixo do corte: corte leve, normal
        assertThat(Avaliador.avaliar(ref, A, ctx(1120, null, null), todos(0.15), false).zMax())
                .isCloseTo(-2.5, within(1e-9));
        // nem vazio nem corte: sai do normal
        assertThat(Avaliador.avaliar(ref, A, ctx(1120, null, null), todos(0.40), false).zMax())
                .isCloseTo(10.0, within(1e-9));
    }

    @Test
    void semEnsaioSemUmaDasDuasFicaSemReferenciaCompleta() {
        ReferenciaAtiva soVazio = ref(etapa(A, 1120, "T1", false, null, 0.10));
        assertThat(Avaliador.avaliar(soVazio, A, ctx(1120, null, null), todos(0.2), false).situacao())
                .isEqualTo(Situacao.SEM_REFERENCIA_COMPLETA);
        assertThat(Avaliador.avaliar(soVazio, A, ctx(450, null, null), todos(0.2), false).situacao())
                .isEqualTo(Situacao.SEM_REFERENCIA);
        List<CelulaGravada> insuficiente = new ArrayList<>(etapa(A, 1120, "T1", false, null, 0.10));
        insuficiente.add(celula(A, Medida.RMS_G, 1120, "T3", false, null, 0.2, false));
        assertThat(Avaliador.avaliar(ref(insuficiente), A, ctx(1120, null, null), todos(0.2), false).situacao())
                .isEqualTo(Situacao.SEM_REFERENCIA_COMPLETA);
    }

    @Test
    void calibracaoDiferenteENaoAvaliavelNaoGeramZ() {
        ReferenciaAtiva ref = ref(etapa(A, 1120, "T1", false, null, 0.10));
        assertThat(Avaliador.avaliar(ref, A, new Avaliador.Contexto(1120, false, "T1", null, null, "A-2"),
                todos(0.5), false).situacao()).isEqualTo(Situacao.CALIBRACAO_DIFERENTE);
        // sem calibração na janela (firmware antigo) não dá para comparar: avalia
        assertThat(Avaliador.avaliar(ref, A, new Avaliador.Contexto(1120, false, "T1", null, null, null),
                todos(0.1), false).situacao()).isEqualTo(Situacao.AVALIADA);
        assertThat(Avaliador.avaliar(ref, A, new Avaliador.Contexto(1120, true, "T1", null, null, "A-1"),
                todos(0.5), false).situacao()).isEqualTo(Situacao.NAO_AVALIAVEL);
    }

    @Test
    void ordensZeradasNaoSaoAvaliadas() {
        ReferenciaAtiva ref = ref(etapa(A, 1120, "T1", false, null, 0.10));
        Function<Medida, Double> valores = m -> m.ordem() ? 0.0 : 0.10;
        Avaliador.Resultado r = Avaliador.avaliar(ref, A, ctx(1120, "T1", null), valores, true);
        assertThat(r.z()).doesNotContainKeys(Medida.O1X, Medida.O2X, Medida.O3X);
        assertThat(r.zMax()).isZero();
    }

    @Test
    void sigmaZeroEmTodasAsMedidasFicaSemReferencia() {
        List<CelulaGravada> zeradas = new ArrayList<>();
        for (Medida m : Medida.values()) {
            zeradas.add(new CelulaGravada(0, A, "A", m, 1120, "T1", false, null, null, 30, 0, 0, 0, 0, null, 0, true,
                    null, null));
        }
        assertThat(Avaliador.avaliar(ref(zeradas), A, ctx(1120, "T1", null), todos(0.1), false).situacao())
                .isEqualTo(Situacao.SEM_REFERENCIA);
    }

    @Test
    void velocidadeAusenteNaoEntra() {
        ReferenciaAtiva ref = ref(etapa(A, 1120, "T1", false, null, 0.10));
        Avaliador.Resultado r = Avaliador.avaliar(ref, A, ctx(1120, "T1", null),
                m -> m == Medida.VEL_RMS_MM_S ? null : 0.1, false);
        assertThat(r.z()).doesNotContainKey(Medida.VEL_RMS_MM_S);
        assertThat(r.dominante()).isNotNull();
    }
}

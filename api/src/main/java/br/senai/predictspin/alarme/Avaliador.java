package br.senai.predictspin.alarme;

import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

import br.senai.predictspin.referencia.Estatistica;
import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaRepository.CelulaGravada;

/**
 * Compara um ponto de uma janela com a referência (sem banco, para ser testado à parte).
 * <ul>
 *   <li>Dentro de ensaio: a referência da etapa; T2 usa a do T1; no T3, a da receita (material +
 *       ferramenta) quando a célula do RMS da receita é suficiente, senão a T3 genérica da marcha
 *       ("referência genérica").</li>
 *   <li>Sem ensaio: rotação 0 → T0. Girando → compara com o T1 e com a T3 genérica da mesma marcha e
 *       fica com a de menor pior z (a interpretação mais normal). Se faltar uma das duas, o ponto fica
 *       "sem referência completa": comparar o corte só com o giro em vazio alarmaria todo corte.</li>
 * </ul>
 * z = (x − mediana) / σ efetivo, só nas células suficientes. As ordens não são avaliadas com o torno
 * parado nem quando vieram zeradas (primeira janela depois de ligar ou trocar de marcha).
 */
public final class Avaliador {

    private Avaliador() {
    }

    /** O que a avaliação precisa saber da janela, além dos valores do ponto. */
    public record Contexto(int marcha, boolean naoAvaliavel, String etapaEnsaio, Long materialId, Long ferramentaId,
                           String calibracao) {
    }

    /**
     * @param z         z de cada medida com célula suficiente (pode ser negativo)
     * @param celulas   célula usada em cada medida (para o típico e o %)
     * @param zMax      maior z entre as medidas que entram no estado (curtose fica de fora); nulo sem z
     * @param dominante medida do zMax
     */
    public record Resultado(Situacao situacao, String etapaRef, boolean generica, Map<Medida, Double> z,
                            Map<Medida, CelulaGravada> celulas, Double zMax, Medida dominante) {

        static Resultado sem(Situacao situacao) {
            return new Resultado(situacao, null, false, Map.of(), Map.of(), null, null);
        }

        public boolean avaliada() {
            return situacao == Situacao.AVALIADA;
        }
    }

    public static Resultado avaliar(ReferenciaAtiva ref, long pontoId, Contexto ctx, Function<Medida, Double> valores,
                                    boolean ordensZeradas) {
        if (ctx.naoAvaliavel()) {
            return Resultado.sem(Situacao.NAO_AVALIAVEL);
        }
        String calibracaoRef = ref.calibracao(pontoId);
        if (calibracaoRef != null && ctx.calibracao() != null && !Objects.equals(calibracaoRef, ctx.calibracao())) {
            return Resultado.sem(Situacao.CALIBRACAO_DIFERENTE);
        }
        int marcha = ctx.marcha();
        boolean semOrdens = marcha == 0 || ordensZeradas;
        String etapa = ctx.etapaEnsaio();
        if (etapa != null) {
            return avaliarNoEnsaio(ref, pontoId, ctx, valores, semOrdens);
        }
        if (marcha == 0) {
            return calcular(celulasDa(ref, pontoId, marcha, "T0"), "T0", false, valores, semOrdens);
        }
        Function<Medida, Optional<CelulaGravada>> t1 = celulasDa(ref, pontoId, marcha, "T1");
        Function<Medida, Optional<CelulaGravada>> t3 = celulasDa(ref, pontoId, marcha, "T3");
        boolean temT1 = t1.apply(Medida.RMS_G).isPresent();
        boolean temT3 = t3.apply(Medida.RMS_G).isPresent();
        if (!temT1 && !temT3) {
            return Resultado.sem(Situacao.SEM_REFERENCIA);
        }
        if (!temT1 || !temT3) {
            return Resultado.sem(Situacao.SEM_REFERENCIA_COMPLETA);
        }
        Resultado vazio = calcular(t1, "T1", false, valores, semOrdens);
        Resultado corte = calcular(t3, "T3", false, valores, semOrdens);
        if (!corte.avaliada()) {
            return vazio;
        }
        if (!vazio.avaliada()) {
            return corte;
        }
        return corte.zMax() < vazio.zMax() ? corte : vazio;
    }

    private static Resultado avaliarNoEnsaio(ReferenciaAtiva ref, long pontoId, Contexto ctx,
                                             Function<Medida, Double> valores, boolean semOrdens) {
        int marcha = ctx.marcha();
        switch (ctx.etapaEnsaio()) {
            case "T0":
                return calcular(celulasDa(ref, pontoId, marcha, "T0"), "T0", false, valores, semOrdens);
            case "T3":
                boolean temReceita = (ctx.materialId() != null || ctx.ferramentaId() != null)
                        && ref.celulaDaReceita(pontoId, Medida.RMS_G, marcha, ctx.materialId(), ctx.ferramentaId())
                        .isPresent();
                if (temReceita) {
                    return calcular(m -> ref.celulaDaReceita(pontoId, m, marcha, ctx.materialId(),
                            ctx.ferramentaId()), "T3", false, valores, semOrdens);
                }
                return calcular(celulasDa(ref, pontoId, marcha, "T3"), "T3", true, valores, semOrdens);
            default:
                // T1 e T2 (T2 não tem referência própria: ferramenta se aproximando, sem contato)
                return calcular(celulasDa(ref, pontoId, marcha, "T1"), "T1", false, valores, semOrdens);
        }
    }

    public static Function<Medida, Optional<CelulaGravada>> celulasDa(ReferenciaAtiva ref, long pontoId, int marcha,
                                                                     String etapa) {
        return medida -> ref.celula(pontoId, medida, marcha, etapa);
    }

    private static Resultado calcular(Function<Medida, Optional<CelulaGravada>> celulas, String etapaRef,
                                      boolean generica, Function<Medida, Double> valores, boolean semOrdens) {
        if (celulas.apply(Medida.RMS_G).isEmpty()) {
            return Resultado.sem(Situacao.SEM_REFERENCIA);
        }
        Map<Medida, Double> zs = new EnumMap<>(Medida.class);
        Map<Medida, CelulaGravada> usadas = new EnumMap<>(Medida.class);
        Double zMax = null;
        Medida dominante = null;
        for (Medida medida : Medida.values()) {
            Double valor = valores.apply(medida);
            Optional<CelulaGravada> celula = celulas.apply(medida);
            if (valor == null || celula.isEmpty() || (semOrdens && medida.ordem())) {
                continue;
            }
            Double z = Estatistica.z(valor, celula.get().mediana(), celula.get().sigmaEfetivo());
            if (z == null) {
                continue;
            }
            zs.put(medida, z);
            usadas.put(medida, celula.get());
            if (medida.entraNoEstado() && (zMax == null || z > zMax)) {
                zMax = z;
                dominante = medida;
            }
        }
        if (zMax == null) {
            return Resultado.sem(Situacao.SEM_REFERENCIA);
        }
        return new Resultado(Situacao.AVALIADA, etapaRef, generica, zs, usadas, zMax, dominante);
    }
}

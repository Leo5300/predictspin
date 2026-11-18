package br.senai.predictspin.referencia;

import java.util.Arrays;

/**
 * Estatística robusta da referência: mediana, σ = 1,4826 × MAD (desvio absoluto mediano; o fator faz o
 * σ valer o desvio-padrão quando os dados são normais) e p95. Percentis por interpolação linear entre
 * as amostras ordenadas (o mesmo método padrão do numpy).
 */
public final class Estatistica {

    /** Fator que torna o MAD comparável ao desvio-padrão numa distribuição normal. */
    public static final double FATOR_MAD = 1.4826;

    private Estatistica() {
    }

    public record Resumo(int n, double mediana, double sigma, double p95) {
    }

    /** Resumo de valores não vazios (a ordem de entrada não importa). */
    public static Resumo resumir(double[] valores) {
        if (valores.length == 0) {
            throw new IllegalArgumentException("Sem valores para resumir");
        }
        double[] ordenados = valores.clone();
        Arrays.sort(ordenados);
        double mediana = percentil(ordenados, 0.5);
        double[] desvios = new double[ordenados.length];
        for (int i = 0; i < ordenados.length; i++) {
            desvios[i] = Math.abs(ordenados[i] - mediana);
        }
        Arrays.sort(desvios);
        return new Resumo(ordenados.length, mediana, FATOR_MAD * percentil(desvios, 0.5), percentil(ordenados, 0.95));
    }

    /** Percentil q (0 a 1) de valores JÁ ordenados, por interpolação linear. */
    public static double percentil(double[] ordenados, double q) {
        double posicao = q * (ordenados.length - 1);
        int abaixo = (int) Math.floor(posicao);
        int acima = Math.min(abaixo + 1, ordenados.length - 1);
        double fracao = posicao - abaixo;
        return ordenados[abaixo] + fracao * (ordenados[acima] - ordenados[abaixo]);
    }

    /**
     * σ efetivo: o maior entre o σ da célula, o piso de ruído (quando houver) e a fração mínima da
     * mediana. Em marcha baixa o σ fica minúsculo e qualquer ruído viraria z alto.
     */
    public static double sigmaEfetivo(double sigma, Double pisoRuido, double fracaoMinima, double mediana) {
        double efetivo = Math.max(sigma, fracaoMinima * Math.abs(mediana));
        return pisoRuido == null ? efetivo : Math.max(efetivo, pisoRuido);
    }

    /** z = (x − mediana) / σ efetivo; nulo quando σ efetivo é 0 (não há como medir o afastamento). */
    public static Double z(double valor, double mediana, double sigmaEfetivo) {
        if (sigmaEfetivo <= 0) {
            return null;
        }
        return (valor - mediana) / sigmaEfetivo;
    }
}

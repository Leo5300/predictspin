package br.senai.predictspin.ia;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Tendência de uma série diária, sem banco (testada à parte). Inclinação robusta de Theil-Sen (mediana das
 * inclinações entre todos os pares de dias) com intervalo de 95% pelo método de Sen (postos das inclinações a partir
 * da variância da estatística S de Kendall). Quando a série sobe, estima em quantos dias ela cruzaria o limite,
 * sempre com uma faixa: é estimativa, não data de quebra.
 */
public final class Tendencia {

    private static final double Z_95 = 1.959964;

    private Tendencia() {
    }

    /** Um ponto da série: dia (0, 1, 2... a partir do primeiro) e valor. */
    public record Ponto(double dia, double valor) {
    }

    /**
     * @param inclinacao   por dia (Theil-Sen)
     * @param minima       limite inferior do intervalo de 95% da inclinação
     * @param maxima       limite superior
     * @param nivel        nível atual estimado (reta de Theil-Sen no último dia)
     * @param diasMin      se continuar assim, cruza o limite em pelo menos... (pela inclinação máxima); nulo sem
     *                     estimativa
     * @param diasMax      ...e no máximo (pela inclinação mínima); nulo quando a inclinação mínima não é positiva
     * @param texto        frase pronta para o painel
     */
    public record Resultado(int dias, double inclinacao, double minima, double maxima, double nivel, Double diasMin,
                            Double diasMax, String texto) {
    }

    /** Nulo com menos de {@code minDias} dias: curto demais para dizer qualquer coisa. */
    public static Resultado calcular(List<Ponto> serie, int minDias, double limite) {
        if (serie.size() < Math.max(3, minDias)) {
            return null;
        }
        List<Double> inclinacoes = new ArrayList<>();
        for (int i = 0; i < serie.size(); i++) {
            for (int j = i + 1; j < serie.size(); j++) {
                double dx = serie.get(j).dia() - serie.get(i).dia();
                if (dx != 0) {
                    inclinacoes.add((serie.get(j).valor() - serie.get(i).valor()) / dx);
                }
            }
        }
        double[] s = inclinacoes.stream().mapToDouble(Double::doubleValue).sorted().toArray();
        double b = mediana(s);
        int n = serie.size();
        double c = Z_95 * Math.sqrt(n * (n - 1.0) * (2.0 * n + 5.0) / 18.0);
        int m1 = (int) Math.floor((s.length - c) / 2.0);
        int m2 = (int) Math.ceil((s.length + c) / 2.0);
        double minima = s[Math.max(0, Math.min(s.length - 1, m1))];
        double maxima = s[Math.max(0, Math.min(s.length - 1, m2))];
        double[] interceptos = serie.stream().mapToDouble(p -> p.valor() - b * p.dia()).sorted().toArray();
        double a = mediana(interceptos);
        double ultimoDia = serie.get(n - 1).dia();
        double nivel = a + b * ultimoDia;

        Double diasMin = null;
        Double diasMax = null;
        String texto;
        if (nivel >= limite) {
            texto = "já está no limite ou acima dele";
        } else if (b <= 0 || maxima <= 0) {
            texto = "sem tendência de subida";
        } else if (minima <= 0) {
            diasMin = (limite - nivel) / maxima;
            texto = "subindo, mas sem segurança: se continuar assim, no mínimo " + Math.round(diasMin)
                    + " dias até o limite (o intervalo de 95% inclui não subir)";
        } else {
            diasMin = (limite - nivel) / maxima;
            diasMax = (limite - nivel) / minima;
            texto = "se continuar assim, entre " + Math.round(diasMin) + " e " + Math.round(diasMax)
                    + " dias até o limite";
        }
        return new Resultado(n, b, minima, maxima, nivel, diasMin, diasMax, texto);
    }

    private static double mediana(double[] ordenado) {
        double[] v = ordenado.clone();
        Arrays.sort(v);
        int n = v.length;
        return n % 2 == 1 ? v[n / 2] : (v[n / 2 - 1] + v[n / 2]) / 2.0;
    }
}

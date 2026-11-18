package br.senai.predictspin.alarme;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import br.senai.predictspin.referencia.Medida;

/**
 * Explicação pronta para o painel: as medidas/pontos de maior z, como "B·RMS 4,2σ acima do típico da
 * marcha 1120". Quando só um ponto saiu do normal, acrescenta a dica de conferir a fixação do sensor.
 */
public final class Explicacao {

    public static final int MAXIMO = 3;
    public static final String DICA_SENSOR = "Se só este ponto mudou, confira também a fixação do sensor.";
    private static final Locale PT_BR = Locale.forLanguageTag("pt-BR");

    private Explicacao() {
    }

    /** Uma medida de um ponto, com o z, o valor e o típico da referência. */
    public record Item(String ponto, Medida medida, double z, double valor, double tipico, int marcha) {

        public String texto() {
            String onde = marcha == 0 ? "com o torno parado" : "da marcha " + marcha;
            return String.format(PT_BR, "%s·%s %.1fσ %s do típico %s", ponto, medida.rotulo(), Math.abs(z),
                    z >= 0 ? "acima" : "abaixo", onde);
        }

        /** Diferença percentual em relação ao típico; nula se o típico é 0. */
        public Double diferencaPct() {
            return tipico == 0 ? null : (valor - tipico) / Math.abs(tipico) * 100;
        }
    }

    /** As {@link #MAXIMO} de maior z (só as acima do típico), em ordem decrescente. */
    public static List<Item> principais(List<Item> itens) {
        return itens.stream().filter(i -> i.z() > 0).sorted(Comparator.comparingDouble(Item::z).reversed())
                .limit(MAXIMO).toList();
    }

    /** Texto das principais, separadas por "; ", e a dica do sensor quando só um ponto saiu do normal. */
    public static String texto(List<Item> itens, boolean soUmPontoFora) {
        List<String> partes = new ArrayList<>(principais(itens).stream().map(Item::texto).toList());
        if (partes.isEmpty()) {
            return null;
        }
        String texto = String.join("; ", partes) + ".";
        return soUmPontoFora ? texto + " " + DICA_SENSOR : texto;
    }
}

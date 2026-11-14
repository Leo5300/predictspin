package br.senai.predictspin.catalogo;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Forma de comparação dos nomes do catálogo: minúsculas, sem acento, sem pontuação e com os espaços
 * colapsados. O painel usa a mesma regra (dominio/nomes.ts) para buscar e sugerir.
 */
public final class NomeNormalizado {

    private static final Pattern ACENTOS = Pattern.compile("\\p{M}+");
    private static final Pattern PONTUACAO = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final Pattern ESPACOS = Pattern.compile("\\s+");

    private NomeNormalizado() {
    }

    public static String de(String nome) {
        if (nome == null) {
            return "";
        }
        String semAcento = ACENTOS.matcher(Normalizer.normalize(nome, Normalizer.Form.NFD)).replaceAll("");
        return PONTUACAO.matcher(semAcento.toLowerCase(Locale.ROOT)).replaceAll(" ").trim();
    }

    /** Nome como exibido: só tira os espaços das pontas e colapsa os do meio. */
    public static String exibicao(String nome) {
        return nome == null ? "" : ESPACOS.matcher(nome.trim()).replaceAll(" ");
    }
}

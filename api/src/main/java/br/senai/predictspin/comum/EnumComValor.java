package br.senai.predictspin.comum;

import java.util.Arrays;

/**
 * Enum cujo valor gravado no banco e trafegado no JSON é diferente do nome da constante
 * (por exemplo, FERRAMENTA_DESGASTADA vira "ferramenta_desgastada").
 */
public interface EnumComValor {

    String valor();

    static <E extends Enum<E> & EnumComValor> E de(Class<E> tipo, String valor) {
        if (valor == null) {
            return null;
        }
        String procurado = valor.trim();
        return Arrays.stream(tipo.getEnumConstants())
                .filter(e -> e.valor().equalsIgnoreCase(procurado) || e.name().equalsIgnoreCase(procurado))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Valor '" + valor + "' inválido. Aceitos: " + valoresAceitos(tipo)));
    }

    static <E extends Enum<E> & EnumComValor> String valoresAceitos(Class<E> tipo) {
        return String.join(", ", Arrays.stream(tipo.getEnumConstants()).map(EnumComValor::valor).toList());
    }
}

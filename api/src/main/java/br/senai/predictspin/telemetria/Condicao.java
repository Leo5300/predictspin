package br.senai.predictspin.telemetria;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/** Condição de operação controlada de um ensaio: é o rótulo usado para treinar a classificação. */
public enum Condicao implements EnumComValor {

    NORMAL("normal"),
    FERRAMENTA_DESGASTADA("ferramenta_desgastada"),
    AVANCO_EXCESSIVO("avanco_excessivo"),
    ROTACAO_INADEQUADA("rotacao_inadequada");

    private final String valor;

    Condicao(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static Condicao de(String valor) {
        return EnumComValor.de(Condicao.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<Condicao> {
        public Conversor() {
            super(Condicao.class);
        }
    }
}

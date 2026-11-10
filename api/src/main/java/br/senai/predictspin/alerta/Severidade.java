package br.senai.predictspin.alerta;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

public enum Severidade implements EnumComValor {

    BAIXA("baixa"),
    MEDIA("media"),
    ALTA("alta"),
    CRITICA("critica");

    private final String valor;

    Severidade(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static Severidade de(String valor) {
        return EnumComValor.de(Severidade.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<Severidade> {
        public Conversor() {
            super(Severidade.class);
        }
    }
}

package br.senai.predictspin.telemetria;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.EnumComValor;

/** Ordem de medido_em nas listagens de janelas: asc (mais antiga primeiro) ou desc. */
public enum OrdemJanelas implements EnumComValor {

    ASC("asc"),
    DESC("desc");

    private final String valor;

    OrdemJanelas(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static OrdemJanelas de(String valor) {
        return EnumComValor.de(OrdemJanelas.class, valor);
    }
}

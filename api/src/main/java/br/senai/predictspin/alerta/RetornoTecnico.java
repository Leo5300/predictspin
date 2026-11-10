package br.senai.predictspin.alerta;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/**
 * Retorno do técnico sobre um alerta ou ordem de serviço: confirma ou rejeita o diagnóstico.
 * Nulo enquanto não houver retorno. Alimenta a avaliação do modelo ({@code versao_modelo}).
 */
public enum RetornoTecnico implements EnumComValor {

    CONFIRMADA("confirmada"),
    REJEITADA("rejeitada");

    private final String valor;

    RetornoTecnico(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static RetornoTecnico de(String valor) {
        return EnumComValor.de(RetornoTecnico.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<RetornoTecnico> {
        public Conversor() {
            super(RetornoTecnico.class);
        }
    }
}

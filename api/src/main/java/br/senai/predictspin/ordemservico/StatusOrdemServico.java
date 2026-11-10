package br.senai.predictspin.ordemservico;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

public enum StatusOrdemServico implements EnumComValor {

    ABERTA("aberta"),
    EM_ANDAMENTO("em_andamento"),
    CONCLUIDA("concluida"),
    CANCELADA("cancelada");

    private final String valor;

    StatusOrdemServico(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static StatusOrdemServico de(String valor) {
        return EnumComValor.de(StatusOrdemServico.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<StatusOrdemServico> {
        public Conversor() {
            super(StatusOrdemServico.class);
        }
    }
}

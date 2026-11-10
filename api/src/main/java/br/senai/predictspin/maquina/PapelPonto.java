package br.senai.predictspin.maquina;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/** Papel de um ponto de medição: é o que generaliza entre classes de máquina. */
public enum PapelPonto implements EnumComValor {

    ACIONAMENTO("acionamento"),
    FERRAMENTA("ferramenta"),
    ESTRUTURA("estrutura");

    private final String valor;

    PapelPonto(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static PapelPonto de(String valor) {
        return EnumComValor.de(PapelPonto.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<PapelPonto> {
        public Conversor() {
            super(PapelPonto.class);
        }
    }
}

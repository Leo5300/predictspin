package br.senai.predictspin.maquina;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/** Grandeza física medida por um canal auxiliar. */
public enum Grandeza implements EnumComValor {

    TEMPERATURA("temperatura"),
    UMIDADE("umidade"),
    CORRENTE("corrente"),
    TENSAO("tensao"),
    POTENCIA("potencia");

    private final String valor;

    Grandeza(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static Grandeza de(String valor) {
        return EnumComValor.de(Grandeza.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<Grandeza> {
        public Conversor() {
            super(Grandeza.class);
        }
    }
}

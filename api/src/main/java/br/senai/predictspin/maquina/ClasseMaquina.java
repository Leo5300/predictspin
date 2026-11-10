package br.senai.predictspin.maquina;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/** Classe de máquina rotativa. */
public enum ClasseMaquina implements EnumComValor {

    SONDA("sonda"),
    TORNO("torno"),
    FURADEIRA("furadeira"),
    FRESADORA("fresadora"),
    CNC("cnc");

    private final String valor;

    ClasseMaquina(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static ClasseMaquina de(String valor) {
        return EnumComValor.de(ClasseMaquina.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<ClasseMaquina> {
        public Conversor() {
            super(ClasseMaquina.class);
        }
    }
}

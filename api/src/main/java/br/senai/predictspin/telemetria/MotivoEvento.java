package br.senai.predictspin.telemetria;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/** O que aconteceu fora do plano durante um ensaio aberto. */
public enum MotivoEvento implements EnumComValor {
    PANCADA("pancada"),
    CAVACO("cavaco"),
    MAQUINA_VIZINHA("maquina_vizinha"),
    OUTRO("outro");

    private final String valor;

    MotivoEvento(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static MotivoEvento de(String valor) {
        return EnumComValor.de(MotivoEvento.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<MotivoEvento> {
        public Conversor() {
            super(MotivoEvento.class);
        }
    }
}

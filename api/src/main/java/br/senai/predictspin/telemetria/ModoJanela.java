package br.senai.predictspin.telemetria;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/** Ritmo em que o dispositivo resumiu o sinal: normal (janela de 5 s) ou rápido (janela de 1 s). */
public enum ModoJanela implements EnumComValor {

    NORMAL("normal"),
    RAPIDO("rapido");

    private final String valor;

    ModoJanela(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static ModoJanela de(String valor) {
        return EnumComValor.de(ModoJanela.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<ModoJanela> {
        public Conversor() {
            super(ModoJanela.class);
        }
    }
}

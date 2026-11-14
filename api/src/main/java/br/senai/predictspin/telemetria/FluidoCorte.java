package br.senai.predictspin.telemetria;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/** Fluido de corte usado na receita do ensaio. */
public enum FluidoCorte implements EnumComValor {
    SECO("seco"),
    EMULSAO("emulsao"),
    OLEO_INTEGRAL("oleo_integral"),
    OUTRO("outro");

    private final String valor;

    FluidoCorte(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static FluidoCorte de(String valor) {
        return EnumComValor.de(FluidoCorte.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<FluidoCorte> {
        public Conversor() {
            super(FluidoCorte.class);
        }
    }
}

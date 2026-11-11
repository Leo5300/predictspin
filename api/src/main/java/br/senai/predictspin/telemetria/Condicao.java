package br.senai.predictspin.telemetria;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.ConversorEnumComValor;
import br.senai.predictspin.comum.EnumComValor;

/**
 * Condição de operação controlada de um ensaio. As de treino são os rótulos da classificação; as de
 * validação servem para conferir alertas e nunca entram como classe de treino.
 */
public enum Condicao implements EnumComValor {

    NORMAL("normal", Uso.TREINO),
    FERRAMENTA_DESGASTADA("ferramenta_desgastada", Uso.TREINO),
    AVANCO_EXCESSIVO("avanco_excessivo", Uso.TREINO),
    ROTACAO_INADEQUADA("rotacao_inadequada", Uso.TREINO),
    DESBALANCEAMENTO("desbalanceamento", Uso.TREINO),
    /** Ímã de um sensor afrouxado de propósito, para testar o alerta de instrumento. */
    SENSOR_SOLTO("sensor_solto", Uso.VALIDACAO);

    /** Para que servem os ensaios da condição. */
    public enum Uso {
        TREINO("treino"),
        VALIDACAO("validacao");

        private final String valor;

        Uso(String valor) {
            this.valor = valor;
        }

        @JsonValue
        public String valor() {
            return valor;
        }
    }

    private final String valor;
    private final Uso uso;

    Condicao(String valor, Uso uso) {
        this.valor = valor;
        this.uso = uso;
    }

    public Uso uso() {
        return uso;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static Condicao de(String valor) {
        return EnumComValor.de(Condicao.class, valor);
    }

    @jakarta.persistence.Converter(autoApply = true)
    public static class Conversor extends ConversorEnumComValor<Condicao> {
        public Conversor() {
            super(Condicao.class);
        }
    }
}

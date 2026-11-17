package br.senai.predictspin.telemetria;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.EnumComValor;

/** Eixo do acelerômetro usado na análise de um ponto (o firmware analisa um eixo por ponto). */
public enum EixoSensor implements EnumComValor {

    X("x"),
    Y("y"),
    Z("z");

    private final String valor;

    EixoSensor(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static EixoSensor de(String valor) {
        return EnumComValor.de(EixoSensor.class, valor);
    }
}

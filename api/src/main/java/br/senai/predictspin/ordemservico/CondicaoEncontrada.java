package br.senai.predictspin.ordemservico;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.EnumComValor;

/**
 * O que o técnico encontrou ao concluir a OS (opcional). Com retorno "confirmada" e uma das 5 classes, as janelas
 * do período do alerta de origem entram no próximo treino com essa condição; "outra" (ou vazio) não entra.
 */
public enum CondicaoEncontrada implements EnumComValor {
    NORMAL("normal"),
    AVANCO_EXCESSIVO("avanco_excessivo"),
    ROTACAO_INADEQUADA("rotacao_inadequada"),
    FERRAMENTA_DESGASTADA("ferramenta_desgastada"),
    DESBALANCEAMENTO("desbalanceamento"),
    OUTRA("outra");

    private final String valor;

    CondicaoEncontrada(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static CondicaoEncontrada de(String valor) {
        return EnumComValor.de(CondicaoEncontrada.class, valor);
    }
}

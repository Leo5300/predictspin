package br.senai.predictspin.alarme;

import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.EnumComValor;

/** Resultado da avaliação de um ponto numa janela; o código é o gravado em avaliacao.situacao. */
public enum Situacao implements EnumComValor {

    /** Comparada com a referência: tem z e estado. */
    AVALIADA("avaliada"),
    /** Nenhuma célula suficiente para a marcha e a etapa. */
    SEM_REFERENCIA("sem_referencia"),
    /** Uso sem ensaio, girando: falta a referência do giro em vazio (T1) ou a do corte (T3) da marcha. */
    SEM_REFERENCIA_COMPLETA("sem_referencia_completa"),
    /** O sensor foi recalibrado depois da referência: os valores em g não são comparáveis. */
    CALIBRACAO_DIFERENTE("calibracao_diferente"),
    /** Janela ruim para comparar: saturou, faltaram amostras ou a rotação está fora da marcha. */
    NAO_AVALIAVEL("nao_avaliavel");

    private final String valor;

    Situacao(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    public short codigo() {
        return (short) ordinal();
    }

    public static Situacao doCodigo(int codigo) {
        return values()[codigo];
    }
}

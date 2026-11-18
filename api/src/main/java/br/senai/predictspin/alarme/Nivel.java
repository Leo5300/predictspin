package br.senai.predictspin.alarme;

import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.EnumComValor;

/** Estado de um ponto (e da máquina): o código é o gravado em avaliacao.estado e estado_ponto.estado. */
public enum Nivel implements EnumComValor {

    NORMAL("normal"),
    ATENCAO("atencao"),
    ALARME("alarme");

    private final String valor;

    Nivel(String valor) {
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

    public static Nivel doCodigo(int codigo) {
        return values()[codigo];
    }

    public boolean acimaDe(Nivel outro) {
        return ordinal() > outro.ordinal();
    }

    public static Nivel pior(Nivel a, Nivel b) {
        return a.ordinal() >= b.ordinal() ? a : b;
    }
}

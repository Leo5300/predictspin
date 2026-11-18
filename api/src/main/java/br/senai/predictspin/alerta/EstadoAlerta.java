package br.senai.predictspin.alerta;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.EnumComValor;

/**
 * Ciclo de vida de um alerta pela ISA-18.2: ativo não reconhecido → ativo reconhecido → (volta ao
 * normal) encerrado. Voltou ao normal sem reconhecimento: normalizado não reconhecido, que vira
 * encerrado quando alguém reconhece. Suprimido: só ADMIN, com motivo e prazo.
 */
public enum EstadoAlerta implements EnumComValor {

    ATIVO_NAO_RECONHECIDO("ativo_nao_reconhecido"),
    ATIVO_RECONHECIDO("ativo_reconhecido"),
    NORMALIZADO_NAO_RECONHECIDO("normalizado_nao_reconhecido"),
    ENCERRADO("encerrado"),
    SUPRIMIDO("suprimido");

    private final String valor;

    EstadoAlerta(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    @JsonCreator
    public static EstadoAlerta de(String valor) {
        return EnumComValor.de(EstadoAlerta.class, valor);
    }

    /** Ativo ou suprimido: ainda conta como "o alerta do ponto". */
    public boolean emAberto() {
        return this == ATIVO_NAO_RECONHECIDO || this == ATIVO_RECONHECIDO || this == SUPRIMIDO;
    }
}

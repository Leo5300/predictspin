package br.senai.predictspin.telemetria;

import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.telemetria.dto.EnsaioResposta;

/** Anunciado quando um ensaio é aberto, encerrado ou descartado. */
public record EnsaioAlterado(Acao acao, EnsaioResposta ensaio) {

    public enum Acao {
        ABERTO("aberto"),
        ENCERRADO("encerrado"),
        DESCARTADO("descartado");

        private final String valor;

        Acao(String valor) {
            this.valor = valor;
        }

        @JsonValue
        public String valor() {
            return valor;
        }
    }
}

package br.senai.predictspin.comum;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Corpo padronizado de toda resposta de erro da API. Nunca carrega stack trace. */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ErroResposta(
        Instant timestamp,
        int status,
        String erro,
        String mensagem,
        String caminho,
        List<CampoInvalido> campos) {

    public record CampoInvalido(String campo, String mensagem) {
    }
}

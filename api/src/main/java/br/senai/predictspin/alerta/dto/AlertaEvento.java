package br.senai.predictspin.alerta.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** Corpo do evento "alerta" do fluxo ao vivo. */
public record AlertaEvento(
        @Schema(description = "O que aconteceu", allowableValues = {"abriu", "piorou", "normalizou", "reconhecido",
                "suprimido", "supressao_encerrada", "encerrado"}) String acao,
        AlertaResposta alerta) {
}

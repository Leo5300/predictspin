package br.senai.predictspin.ordemservico.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** Corpo do evento "os" do fluxo ao vivo. */
public record OrdemServicoEvento(
        @Schema(allowableValues = {"aberta", "assumida", "concluida"}) String acao,
        OrdemServicoResposta ordem) {
}

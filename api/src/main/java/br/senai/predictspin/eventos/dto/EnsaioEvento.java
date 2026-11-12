package br.senai.predictspin.eventos.dto;

import br.senai.predictspin.telemetria.EnsaioAlterado;
import br.senai.predictspin.telemetria.dto.EnsaioResposta;
import io.swagger.v3.oas.annotations.media.Schema;

/** Corpo do evento "ensaio" do fluxo ao vivo. */
public record EnsaioEvento(
        @Schema(description = "O que aconteceu com o ensaio: aberto, encerrado ou descartado")
        EnsaioAlterado.Acao acao,
        EnsaioResposta ensaio) {
}

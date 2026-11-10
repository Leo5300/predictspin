package br.senai.predictspin.telemetria.dto;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

public record IngestaoResposta(
        Long janelaId,
        @Schema(description = "true quando a janela já tinha sido recebida: nada foi gravado de novo")
        boolean duplicada,
        @Schema(description = "Ensaio ao qual a janela foi associada, se havia ensaio aberto")
        Long ensaioId,
        Instant medidoEm) {
}

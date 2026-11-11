package br.senai.predictspin.maquina.dto;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

public record ModoRapidoResposta(
        Long maquinaId,
        @Schema(description = "true enquanto o prazo estiver no futuro")
        boolean ativo,
        @Schema(description = "Até quando o modo rápido vale (UTC); nulo quando desligado", example = "2026-11-11T12:02:00Z")
        Instant modoRapidoAte) {
}

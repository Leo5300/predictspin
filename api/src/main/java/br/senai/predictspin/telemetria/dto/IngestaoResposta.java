package br.senai.predictspin.telemetria.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

public record IngestaoResposta(
        Long janelaId,
        @Schema(description = "true quando a janela já tinha sido recebida: nada foi gravado de novo")
        boolean duplicada,
        @Schema(description = "Ensaio ao qual a janela foi associada, se havia ensaio aberto")
        Long ensaioId,
        Instant medidoEm,
        @Schema(description = "Só aparece enquanto a máquina estiver em modo rápido: até quando o dispositivo deve "
                + "mandar janelas de 1 s (UTC)", example = "2026-11-11T12:02:00Z",
                requiredMode = Schema.RequiredMode.NOT_REQUIRED)
        @JsonInclude(JsonInclude.Include.NON_NULL)
        Instant modoRapidoAte) {

    public IngestaoResposta(Long janelaId, boolean duplicada, Long ensaioId, Instant medidoEm) {
        this(janelaId, duplicada, ensaioId, medidoEm, null);
    }
}

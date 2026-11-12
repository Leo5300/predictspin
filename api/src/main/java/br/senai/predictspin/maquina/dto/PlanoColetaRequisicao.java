package br.senai.predictspin.maquina.dto;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** Rotações escolhidas para a grade de cobertura da coleta. Lista vazia limpa o plano. */
public record PlanoColetaRequisicao(
        @Schema(description = "Rotações alvo em rpm; repetidas são ignoradas e a lista é gravada em ordem crescente",
                example = "[280, 560, 1120]")
        @NotNull @Size(max = 40) List<@NotNull @Min(0) @Max(30000) Integer> rotacoesRpm) {
}

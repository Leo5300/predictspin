package br.senai.predictspin.demo.dto;

import br.senai.predictspin.demo.NivelDemo;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** Troca o nível da vibração simulada. */
public record CenarioDemoRequisicao(
        @Schema(description = "PARADA, NORMAL, ATENCAO ou ALARME", example = "ATENCAO") @NotNull NivelDemo nivel) {
}

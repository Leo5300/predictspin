package br.senai.predictspin.telemetria.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import br.senai.predictspin.telemetria.MotivoEvento;
import io.swagger.v3.oas.annotations.media.Schema;

public record NovoEventoMarcadoRequisicao(
        @Schema(description = "Instante do toque em \"Marcar evento\" (UTC). Sem ele, o instante do pedido.")
        Instant ocorridoEm,
        @Schema(example = "pancada") @NotNull MotivoEvento motivo,
        @Schema(example = "martelo na bancada ao lado") @Size(max = 500) String nota) {
}

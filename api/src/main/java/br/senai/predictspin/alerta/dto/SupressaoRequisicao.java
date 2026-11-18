package br.senai.predictspin.alerta.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** Supressão de um alerta (só ADMIN): motivo e prazo; volta sozinho ao fim do prazo. */
public record SupressaoRequisicao(
        @Schema(example = "Máquina ao lado em manutenção fazendo o C vibrar") @NotBlank @Size(max = 500) String motivo,
        @Schema(example = "60", description = "Prazo em minutos, de 1 até ps.alarme.supressao-max-min (10080, uma "
                + "semana, por padrão; o valor em uso está na rota de limites)")
        @NotNull @Min(1) Integer minutos) {
}

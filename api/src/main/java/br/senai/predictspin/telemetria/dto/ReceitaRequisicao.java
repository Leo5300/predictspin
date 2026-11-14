package br.senai.predictspin.telemetria.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Size;

import br.senai.predictspin.telemetria.FluidoCorte;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Correção da receita (PATCH): só os campos presentes mudam; null apaga o campo. Qualquer outro campo
 * (etapa, condicao, rotacao_alvo_rpm, simulado, período...) é recusado com 400.
 */
@Schema(description = "Campos da receita do corte e a observação. Só os presentes no corpo mudam; null apaga.")
public record ReceitaRequisicao(
        @Schema(description = "Material do catálogo") Long materialId,
        @Schema(description = "Ferramenta do catálogo") Long ferramentaId,
        @Schema(example = "0.15", description = "Avanço em mm/volta")
        @DecimalMin("0") @Digits(integer = 5, fraction = 3) BigDecimal avancoAlvo,
        @Schema(example = "1.5", description = "Profundidade de corte em mm (0,05 a 10)")
        @DecimalMin("0.05") @DecimalMax("10") @Digits(integer = 3, fraction = 3) BigDecimal profundidadeCorteMm,
        @Schema(example = "38", description = "Diâmetro da peça em mm (1 a 500)")
        @DecimalMin("1") @DecimalMax("500") @Digits(integer = 5, fraction = 2) BigDecimal diametroPecaMm,
        @Schema(example = "emulsao") FluidoCorte fluidoCorte,
        @Size(max = 2000) String observacao) {
}

package br.senai.predictspin.telemetria.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import br.senai.predictspin.telemetria.Condicao;
import br.senai.predictspin.telemetria.Etapa;
import io.swagger.v3.oas.annotations.media.Schema;

public record NovoEnsaioRequisicao(
        @Schema(example = "T1") @NotNull Etapa etapa,
        @Schema(example = "normal") @NotNull Condicao condicao,
        @Schema(example = "1200") @NotNull @Min(0) @Max(30000) Integer rotacaoAlvoRpm,
        @Schema(example = "aço SAE 1045") @Size(max = 80) String material,
        @Schema(example = "1", description = "Padrão 1") @Min(1) @Max(1000) Integer repeticao,
        @Schema(example = "0.15", description = "Avanço alvo em mm/volta (opcional)")
        @DecimalMin("0") @Digits(integer = 5, fraction = 3) BigDecimal avancoAlvo,
        @Size(max = 2000) String observacao,
        @Schema(description = "Marca o ensaio como simulado. Também vira simulado quando a máquina só tem "
                + "dispositivo simulado ativo.")
        Boolean simulado) {
}

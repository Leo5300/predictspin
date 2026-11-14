package br.senai.predictspin.telemetria.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import br.senai.predictspin.telemetria.Condicao;
import br.senai.predictspin.telemetria.Etapa;
import br.senai.predictspin.telemetria.FluidoCorte;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Abertura de um ensaio. A receita do corte (material, ferramenta, avanço, profundidade, diâmetro,
 * fluido) é toda opcional. O texto "material" continua aceito: sem material_id, a API procura no
 * catálogo pelo nome normalizado e, se não existir, cria o item.
 */
public record NovoEnsaioRequisicao(
        @Schema(example = "T1") @NotNull Etapa etapa,
        @Schema(example = "normal") @NotNull Condicao condicao,
        @Schema(example = "1200") @NotNull @Min(0) @Max(30000) Integer rotacaoAlvoRpm,
        @Schema(example = "aço SAE 1045", description = "Texto livre; vira item do catálogo de materiais")
        @Size(max = 80) String material,
        @Schema(example = "1", description = "Padrão 1") @Min(1) @Max(1000) Integer repeticao,
        @Schema(example = "0.15", description = "Avanço alvo em mm/volta (opcional)")
        @DecimalMin("0") @Digits(integer = 5, fraction = 3) BigDecimal avancoAlvo,
        @Size(max = 2000) String observacao,
        @Schema(description = "Marca o ensaio como simulado. Também vira simulado quando a máquina só tem "
                + "dispositivo simulado ativo.")
        Boolean simulado,
        @Schema(description = "Material do catálogo (vence o texto de material)") Long materialId,
        @Schema(description = "Ferramenta do catálogo") Long ferramentaId,
        @Schema(example = "1.5", description = "Profundidade de corte em mm (0,05 a 10)")
        @DecimalMin("0.05") @DecimalMax("10") @Digits(integer = 3, fraction = 3) BigDecimal profundidadeCorteMm,
        @Schema(example = "38", description = "Diâmetro da peça em mm (1 a 500)")
        @DecimalMin("1") @DecimalMax("500") @Digits(integer = 5, fraction = 2) BigDecimal diametroPecaMm,
        @Schema(example = "emulsao") FluidoCorte fluidoCorte) {

    /** Abertura sem receita do catálogo (como antes da V5). */
    public NovoEnsaioRequisicao(Etapa etapa, Condicao condicao, Integer rotacaoAlvoRpm, String material,
                                Integer repeticao, BigDecimal avancoAlvo, String observacao, Boolean simulado) {
        this(etapa, condicao, rotacaoAlvoRpm, material, repeticao, avancoAlvo, observacao, simulado, null, null,
                null, null, null);
    }
}

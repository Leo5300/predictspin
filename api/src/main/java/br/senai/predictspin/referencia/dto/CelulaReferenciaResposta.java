package br.senai.predictspin.referencia.dto;

import org.springframework.lang.Nullable;

import br.senai.predictspin.referencia.Medida;
import io.swagger.v3.oas.annotations.media.Schema;

/** Uma célula da referência: o normal de uma medida num ponto, numa marcha e numa etapa (e receita). */
public record CelulaReferenciaResposta(
        @Schema(example = "B") String ponto,
        Medida medida,
        @Schema(description = "0 no T0; senão a rotação nominal da marcha") int marchaRpm,
        @Schema(example = "T3") String etapa,
        @Schema(description = "true: célula de uma receita no T3; false: T0, T1 ou T3 genérica") boolean porReceita,
        @Nullable Long materialId,
        @Nullable Long ferramentaId,
        int n,
        int nDeriva,
        double mediana,
        @Schema(description = "1,4826 × MAD") double sigma,
        double p95,
        @Schema(description = "p95 da medida no T0 do ponto; nulo quando não medido") @Nullable Double pisoRuido,
        @Schema(description = "Maior entre σ, piso de ruído e a fração mínima da mediana") double sigmaEfetivo,
        @Schema(description = "false: menos janelas que o mínimo, não gera z") boolean suficiente,
        @Schema(description = "Calibração das janelas usadas; nula quando o firmware não informava")
        @Nullable String calibracao,
        @Nullable String firmwareVersoes) {
}

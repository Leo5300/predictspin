package br.senai.predictspin.telemetria.dto;

import java.time.Instant;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import br.senai.predictspin.telemetria.ModoJanela;
import io.swagger.v3.oas.annotations.media.Schema;

/** Payload enviado pelo ESP32 (ou simulador) a cada janela. Contrato fixo: ver docs/payload.md. */
public record TelemetriaRequisicao(
        @Schema(example = "ps-torno-01")
        @NotBlank @Size(max = 60) String dispositivo,

        @Schema(example = "2026-11-10T12:00:00Z", description = "Instante da medição, em UTC (ISO-8601)")
        @NotNull Instant medidoEm,

        @Schema(example = "1200.0")
        @NotNull @PositiveOrZero @DecimalMax("30000") Double rotacaoRpm,

        @Schema(example = "false", description = "Algum acelerômetro chegou ao fundo de escala nesta janela")
        @NotNull Boolean saturou,

        @Schema(description = "Características por ponto de medição, pelo código do ponto (A, B, C)")
        @NotEmpty @Size(max = 16) Map<@NotBlank String, @NotNull @Valid MedidaPonto> pontos,

        @Schema(description = "Opcional. Valor de cada canal auxiliar, pelo código do canal; cada chave é opcional")
        @Size(max = 32) Map<@NotBlank String, @NotNull Double> canais,

        @Schema(description = "Opcional. normal (janela de 5 s) ou rapido (janela de 1 s); ausente = normal",
                example = "normal")
        ModoJanela modo,

        @Schema(description = "Opcional. Menor número de amostras lidas entre os sensores nesta janela", example = "8000")
        @PositiveOrZero @Max(1_000_000) Integer amostras,

        @Schema(description = "Opcional. Amostras que a janela deveria ter (taxa × duração)", example = "8000")
        @Positive @Max(1_000_000) Integer amostrasEsperadas) {

    /** Construtor do contrato original, sem os campos opcionais de modo e amostras. */
    public TelemetriaRequisicao(String dispositivo, Instant medidoEm, Double rotacaoRpm, Boolean saturou,
                                Map<String, MedidaPonto> pontos, Map<String, Double> canais) {
        this(dispositivo, medidoEm, rotacaoRpm, saturou, pontos, canais, null, null, null);
    }

    /** Modo efetivo: ausente vale como normal. */
    public ModoJanela modoOuNormal() {
        return modo == null ? ModoJanela.NORMAL : modo;
    }

    public record MedidaPonto(
            @Schema(example = "0.12") @NotNull @PositiveOrZero @DecimalMax("1000") Double rmsG,
            @Schema(example = "0.45") @NotNull @PositiveOrZero @DecimalMax("1000") Double picoG,
            @Schema(example = "3.1") @NotNull @DecimalMax("1000000") Double curtose,
            @Schema(example = "0.08") @NotNull @PositiveOrZero @DecimalMax("1000") Double o1x,
            @Schema(example = "0.03") @NotNull @PositiveOrZero @DecimalMax("1000") Double o2x,
            @Schema(example = "0.01") @NotNull @PositiveOrZero @DecimalMax("1000") Double o3x) {
    }
}

package br.senai.predictspin.telemetria.dto;

import java.time.Instant;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonInclude;

import br.senai.predictspin.telemetria.EixoSensor;
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
        @Positive @Max(1_000_000) Integer amostrasEsperadas,

        @Schema(description = "Opcional. Versão do firmware que mediu a janela (\"simulado\" no simulador)",
                example = "2026-11-17+76951bf")
        @Size(min = 1, max = 40) String firmwareVersao,

        @Schema(description = "Opcional. Identificador da calibração usada em cada ponto, pelo código do ponto "
                + "(\"nominal\" quando o sensor não foi calibrado)")
        @Size(max = 16) Map<@NotBlank String, @NotNull @Size(min = 1, max = 40)
                @Pattern(regexp = ID_CALIBRACAO, message = "use só letras, números e . _ : + -") String> calibracao,

        @Schema(description = "Opcional. Eixo do acelerômetro analisado em cada ponto, pelo código do ponto")
        @Size(max = 16) Map<@NotBlank String, @NotNull EixoSensor> eixos) {

    /** Caracteres aceitos no identificador da calibração. */
    public static final String ID_CALIBRACAO = "[A-Za-z0-9._:+-]+";

    /** Construtor do contrato original, sem os campos opcionais. */
    public TelemetriaRequisicao(String dispositivo, Instant medidoEm, Double rotacaoRpm, Boolean saturou,
                                Map<String, MedidaPonto> pontos, Map<String, Double> canais) {
        this(dispositivo, medidoEm, rotacaoRpm, saturou, pontos, canais, null, null, null);
    }

    /** Contrato da V3 (modo e amostras), sem a rastreabilidade da V6. */
    public TelemetriaRequisicao(String dispositivo, Instant medidoEm, Double rotacaoRpm, Boolean saturou,
                                Map<String, MedidaPonto> pontos, Map<String, Double> canais, ModoJanela modo,
                                Integer amostras, Integer amostrasEsperadas) {
        this(dispositivo, medidoEm, rotacaoRpm, saturou, pontos, canais, modo, amostras, amostrasEsperadas,
                null, null, null);
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
            @Schema(example = "0.01") @NotNull @PositiveOrZero @DecimalMax("1000") Double o3x,
            @Schema(example = "1.85", description = "Opcional. Velocidade RMS em mm/s (no firmware, banda de 10 Hz "
                    + "a ~800 Hz)")
            // JsonInclude: o esquema MedidaPonto não termina em "Requisicao" e seria lido como resposta, com
            // toda propriedade obrigatória; assim o documento diz que a velocidade pode faltar
            @JsonInclude(JsonInclude.Include.NON_NULL)
            @PositiveOrZero @DecimalMax("100000") Double velRmsMmS,
            @Schema(example = "false", description = "Opcional. Este acelerômetro bateu no fundo de escala nesta "
                    + "janela. Quando vem, o alerta de instrumento por saturação vai para este ponto; sem ele, a API só "
                    + "sabe o \"saturou\" da janela inteira")
            @JsonInclude(JsonInclude.Include.NON_NULL)
            Boolean saturou,
            @Schema(example = "8000", description = "Opcional. Amostras lidas deste sensor nesta janela (o campo "
                    + "\"amostras\" da janela é a menor entre os sensores)")
            @JsonInclude(JsonInclude.Include.NON_NULL)
            @PositiveOrZero @Max(1_000_000) Integer amostras) {

        /** Ponto sem velocidade (contrato anterior à V6). */
        public MedidaPonto(Double rmsG, Double picoG, Double curtose, Double o1x, Double o2x, Double o3x) {
            this(rmsG, picoG, curtose, o1x, o2x, o3x, null);
        }

        /** Ponto sem a saturação e as amostras por sensor (contrato anterior à parte B). */
        public MedidaPonto(Double rmsG, Double picoG, Double curtose, Double o1x, Double o2x, Double o3x,
                           Double velRmsMmS) {
            this(rmsG, picoG, curtose, o1x, o2x, o3x, velRmsMmS, null, null);
        }
    }
}

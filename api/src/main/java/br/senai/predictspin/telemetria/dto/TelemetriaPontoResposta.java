package br.senai.predictspin.telemetria.dto;

import org.springframework.lang.Nullable;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

/** Uma linha da série temporal de um ponto de medição. */
public record TelemetriaPontoResposta(
        Long janelaId,
        Instant medidoEm,
        Instant recebidoEm,
        double rotacaoRpm,
        boolean saturou,
        @Nullable Long ensaioId,
        String dispositivo,
        boolean simulado,
        double rmsG,
        double picoG,
        double curtose,
        double o1x,
        double o2x,
        double o3x,
        @Schema(description = "Velocidade RMS em mm/s; só aparece quando o dispositivo mandou",
                requiredMode = Schema.RequiredMode.NOT_REQUIRED)
        @JsonInclude(JsonInclude.Include.NON_NULL) Double velRmsMmS) {

    /** Linha sem velocidade. */
    public TelemetriaPontoResposta(Long janelaId, Instant medidoEm, Instant recebidoEm, double rotacaoRpm,
                                   boolean saturou, Long ensaioId, String dispositivo, boolean simulado, double rmsG,
                                   double picoG, double curtose, double o1x, double o2x, double o3x) {
        this(janelaId, medidoEm, recebidoEm, rotacaoRpm, saturou, ensaioId, dispositivo, simulado, rmsG, picoG,
                curtose, o1x, o2x, o3x, null);
    }
}

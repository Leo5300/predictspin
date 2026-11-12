package br.senai.predictspin.telemetria.dto;

import org.springframework.lang.Nullable;
import java.time.Instant;

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
        double o3x) {
}

package br.senai.predictspin.telemetria.dto;

import java.time.Instant;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

/** Estado mais recente de uma máquina: os pontos, os canais e a rotação da última janela. */
public record UltimaJanelaResposta(
        Long janelaId,
        String dispositivo,
        boolean simulado,
        Instant medidoEm,
        Instant recebidoEm,
        @Schema(description = "Segundos desde que a janela chegou à API")
        long segundosDesdeRecebimento,
        double rotacaoRpm,
        boolean saturou,
        Long ensaioId,
        String ensaioCodigo,
        Map<String, Ponto> pontos,
        Map<String, Canal> canais) {

    public record Ponto(Long pontoId, String papel, String descricao, double rmsG, double picoG, double curtose,
                        double o1x, double o2x, double o3x) {
    }

    public record Canal(double valor, String unidade, String grandeza) {
    }
}

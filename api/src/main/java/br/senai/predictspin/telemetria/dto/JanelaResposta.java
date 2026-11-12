package br.senai.predictspin.telemetria.dto;

import org.springframework.lang.Nullable;
import java.time.Instant;
import java.util.Map;

import br.senai.predictspin.telemetria.ModoJanela;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Uma janela completa: o envio, os pontos e os canais, no mesmo formato da última janela. É o item
 * das listagens de janelas e o corpo do evento "janela" do fluxo ao vivo.
 */
public record JanelaResposta(
        Long id,
        Instant medidoEm,
        Instant recebidoEm,
        double rotacaoRpm,
        boolean saturou,
        @Schema(description = "normal (janela de 5 s) ou rapido (janela de 1 s)")
        ModoJanela modo,
        @Schema(description = "Menor número de amostras lidas entre os sensores; nulo se o dispositivo não informou")
        @Nullable Integer amostras,
        @Nullable Integer amostrasEsperadas,
        @Schema(description = "true quando a janela veio de dispositivo simulado")
        boolean simulado,
        String dispositivo,
        @Nullable Long ensaioId,
        @Nullable String ensaioCodigo,
        @Schema(description = "Características por código do ponto (A, B, C)")
        Map<String, UltimaJanelaResposta.Ponto> pontos,
        @Schema(description = "Leituras por código do canal; vazio se a janela não trouxe canais")
        Map<String, UltimaJanelaResposta.Canal> canais) {
}

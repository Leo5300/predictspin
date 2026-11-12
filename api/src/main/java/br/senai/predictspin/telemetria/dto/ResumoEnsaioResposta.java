package br.senai.predictspin.telemetria.dto;

import org.springframework.lang.Nullable;
import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

public record ResumoEnsaioResposta(
        Long ensaioId,
        String codigo,
        boolean aberto,
        boolean descartado,
        boolean simulado,
        Instant iniciadoEm,
        @Nullable Instant encerradoEm,
        @Schema(description = "Do início ao encerramento (ou até agora, se aberto)")
        long duracaoSegundos,
        long janelas,
        long janelasSaturadas,
        @Schema(description = "Média de rotacao_rpm das janelas; nulo se não houver janela")
        @Nullable Double rotacaoMediaRpm,
        @Nullable Instant primeiraMedicao,
        @Nullable Instant ultimaMedicao) {
}

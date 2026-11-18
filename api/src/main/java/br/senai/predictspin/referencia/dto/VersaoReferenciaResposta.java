package br.senai.predictspin.referencia.dto;

import java.time.Instant;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

/** Uma versão (imutável) da referência de uma máquina. */
public record VersaoReferenciaResposta(
        Long id,
        @Schema(description = "Número da versão na máquina e no tipo de dado (1, 2, ...)") int numero,
        boolean simulado,
        Instant criadaEm,
        @Schema(description = "Nome de quem recalculou") String autor,
        @Schema(description = "Janelas de ensaio usadas") int janelasUsadas,
        @Schema(description = "Janelas de uso normal (deriva) usadas") int janelasDeriva,
        @Schema(description = "Janelas excluídas por motivo (uma janela pode ter mais de um motivo; "
                + "calibracao_antiga conta janela e ponto)") Map<String, Integer> excluidas,
        int celulas,
        int celulasSuficientes) {
}

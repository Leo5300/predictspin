package br.senai.predictspin.eventos.dto;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Corpo do evento "recuperacao" do fluxo ao vivo: janelas antigas que o dispositivo reenviou depois de
 * uma queda de rede, juntadas no período. Elas já estão gravadas e aparecem nas consultas; o painel
 * não recebe uma a uma.
 */
public record RecuperacaoEvento(
        Long maquinaId,
        @Schema(description = "true quando as janelas vieram de dispositivo simulado")
        boolean simulado,
        @Schema(description = "medido_em da janela mais antiga recebida no período")
        Instant de,
        @Schema(description = "medido_em da janela mais recente recebida no período")
        Instant ate,
        @Schema(description = "Quantas janelas antigas chegaram no período")
        long quantidade) {
}

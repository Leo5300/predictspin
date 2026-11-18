package br.senai.predictspin.telemetria;

import java.time.Instant;

/**
 * Anunciado pela ingestão quando uma janela NOVA chega com medido_em mais antigo que o limite do ao
 * vivo (reenvio da fila do dispositivo depois de uma queda de rede). Não vira evento "janela": o
 * fluxo ao vivo junta essas janelas num evento "recuperacao" a cada poucos segundos.
 */
public record JanelaRecuperada(Long maquinaId, boolean simulado, Instant medidoEm) {
}

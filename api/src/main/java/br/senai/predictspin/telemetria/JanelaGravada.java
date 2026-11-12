package br.senai.predictspin.telemetria;

/** Anunciado pela ingestão quando uma janela NOVA é gravada (reenvio não anuncia). */
public record JanelaGravada(Long maquinaId, long janelaId) {
}

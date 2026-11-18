package br.senai.predictspin.alarme;

/**
 * Anunciado pela avaliação, DENTRO da transação da ingestão e antes de gravar o estado dos pontos:
 * alertas e OS reagem a ele e podem mexer no estado (por exemplo, zerar a severidade desde a última OS).
 */
public record JanelaAvaliada(AvaliacaoService.ResultadoJanela resultado) {
}

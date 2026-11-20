package br.senai.predictspin.alarme;

/**
 * Anunciado DEPOIS do commit da avaliação de uma janela, fora de transação, na fila da máquina: é quando a segunda
 * opinião do modelo roda. Nada do que acontece aqui volta para a regra (estado, alerta e OS já estão gravados).
 */
public record JanelaAvaliadaGravada(AvaliacaoService.ResultadoJanela resultado) {
}

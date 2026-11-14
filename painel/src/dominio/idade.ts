/**
 * Idade do dado. "Dado velho" = a última janela chegou há mais de 15 s no modo normal ou de 4 s no
 * modo rápido. A idade é contada a partir de uma observação (a resposta da API ou a chegada de um
 * evento) com o relógio monotônico do navegador, para não depender do acerto do relógio do
 * computador em relação ao do servidor.
 */

export const LIMIAR_VELHO_NORMAL_S = 15
export const LIMIAR_VELHO_RAPIDO_S = 4

/** Quando o painel soube da última janela e que idade ela tinha naquele instante. */
export type Observacao = {
  /** Segundos desde a chegada da janela à API, no instante da observação. */
  idadeNaObservacaoS: number
  /** Relógio monotônico (performance.now) no instante da observação, em ms. */
  observadoEmMs: number
}

export type Frescor = 'vivo' | 'velho' | 'ausente'

export function idadeEmSegundos(observacao: Observacao, agoraMs: number): number {
  return observacao.idadeNaObservacaoS + Math.max(0, agoraMs - observacao.observadoEmMs) / 1000
}

/**
 * O limiar curto só vale enquanto a máquina está de fato em modo rápido E a última janela já veio
 * rápida. Na troca de ritmo (ligar ou desligar) vale o limiar longo, senão o dado pareceria velho
 * por um instante sem ter parado de chegar.
 */
export function limiarVelhoS(
  modoDaUltimaJanela: 'normal' | 'rapido',
  modoRapidoAtivo: boolean,
): number {
  return modoDaUltimaJanela === 'rapido' && modoRapidoAtivo
    ? LIMIAR_VELHO_RAPIDO_S
    : LIMIAR_VELHO_NORMAL_S
}

export function frescor(observacao: Observacao | null, agoraMs: number, limiarS: number): Frescor {
  if (!observacao) return 'ausente'
  return idadeEmSegundos(observacao, agoraMs) > limiarS ? 'velho' : 'vivo'
}

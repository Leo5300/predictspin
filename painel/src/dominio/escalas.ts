import type { Referencia } from './estado'

/**
 * Escalas do mapa de ordens e da régua de desvio.
 *
 * Mapa de ordens sem referência: cada linha (ponto × grandeza) tem a própria escala, de zero ao
 * maior valor da linha no período; a célula é um tom de cinza proporcional à amplitude. Com
 * referência, o que passa do limite de atenção fica âmbar e o que passa do de alarme, vermelho.
 */

export type EscalaLinha = { maximo: number }

export function escalaDaLinha(valores: readonly (number | null | undefined)[]): EscalaLinha {
  let maximo = 0
  for (const v of valores) {
    if (v !== null && v !== undefined && Number.isFinite(v) && v > maximo) maximo = v
  }
  return { maximo }
}

/** Nível de 0 (amplitude zero) a 1 (o máximo da linha). Linha toda zerada fica em 0. */
export function nivelDeCinza(valor: number, escala: EscalaLinha): number {
  if (!Number.isFinite(valor) || escala.maximo <= 0) return 0
  return Math.min(1, Math.max(0, valor / escala.maximo))
}

export type CorDaCelula =
  { tipo: 'lacuna' } | { tipo: 'cinza'; nivel: number } | { tipo: 'atencao' } | { tipo: 'alarme' }

export function corDaCelula(
  valor: number | null | undefined,
  escala: EscalaLinha,
  referencia?: Referencia | null,
): CorDaCelula {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return { tipo: 'lacuna' }
  if (referencia) {
    if (valor >= referencia.alarme) return { tipo: 'alarme' }
    if (valor >= referencia.atencao) return { tipo: 'atencao' }
  }
  return { tipo: 'cinza', nivel: nivelDeCinza(valor, escala) }
}

/**
 * Posição do ponteiro na régua de desvio, de 0 (extremo esquerdo) a 1 (extremo direito), com o
 * centro (0,5) na referência. A régua cobre de centro − alcance a centro + alcance, onde o alcance
 * vai até o limite de alarme com uma folga; valores fora ficam presos na ponta.
 */
export function posicaoNaRegua(valor: number, referencia: Referencia): number {
  const alcance = alcanceDaRegua(referencia)
  if (alcance <= 0 || !Number.isFinite(valor)) return 0.5
  return Math.min(1, Math.max(0, 0.5 + (valor - referencia.centro) / (2 * alcance)))
}

export function alcanceDaRegua(referencia: Referencia): number {
  return Math.max(referencia.alarme - referencia.centro, referencia.tolerancia) * 1.25
}

/** Extremos "redondos" de um eixo que contém todos os valores (para os gráficos de tendência). */
export function limitesDoEixo(valores: readonly (number | null | undefined)[]): [number, number] {
  let maximo = 0
  for (const v of valores) {
    if (v !== null && v !== undefined && Number.isFinite(v) && v > maximo) maximo = v
  }
  if (maximo <= 0) return [0, 1]
  const ordem = 10 ** Math.floor(Math.log10(maximo))
  const passos = [1, 2, 2.5, 5, 10]
  const teto = passos.map((p) => p * ordem).find((p) => p >= maximo * 1.05) ?? maximo * 1.1
  return [0, teto]
}

/**
 * Relógio do replay: reproduz um ensaio já gravado como se estivesse acontecendo, nas velocidades
 * 1×, 4× e 16×, com pausa, salto pela linha do tempo e fim. Lógica pura; a tela só chama `avancar`
 * a cada quadro com o tempo real que passou.
 *
 * O tempo do replay é contado em segundos desde a primeira janela. A janela "atual" é a última cuja
 * medição já aconteceu no tempo do replay. Um vão entre janelas maior que 2,5 × o passo normal é
 * lacuna: a tela diz "sem janela" em vez de manter a anterior como se fosse atual.
 */

export const VELOCIDADES = [1, 4, 16] as const
export type Velocidade = (typeof VELOCIDADES)[number]

/** Duração de uma janela normal; o vão maior que 2,5 × isto é lacuna. */
export const PASSO_NORMAL_S = 5
export const FATOR_LACUNA = 2.5

export type EstadoReplay = {
  /** Segundos desde a primeira janela. */
  posicaoS: number
  velocidade: Velocidade
  tocando: boolean
  /** Chegou ao fim (para sozinho; tocar de novo recomeça do início). */
  fim: boolean
}

export type LinhaDoTempo = {
  /** Instante (ms) da primeira janela; posição 0. */
  inicioMs: number
  /** Segundos da primeira à última janela, mais a duração da última. */
  duracaoS: number
  /** Segundos de cada janela, em ordem. */
  temposS: number[]
}

/** Ordena as janelas pela medição e monta a linha do tempo. */
export function linhaDoTempo(
  janelas: readonly { medido_em: string; modo?: string }[],
): LinhaDoTempo {
  const instantes = janelas.map((j) => Date.parse(j.medido_em)).sort((a, b) => a - b)
  const inicioMs = instantes[0] ?? 0
  const temposS = instantes.map((t) => (t - inicioMs) / 1000)
  const ultima = janelas.length > 0 ? janelas.reduce((a, b) => (Date.parse(a.medido_em) > Date.parse(b.medido_em) ? a : b)) : null
  const duracaoUltima = ultima?.modo === 'rapido' ? 1 : PASSO_NORMAL_S
  const duracaoS = temposS.length === 0 ? 0 : (temposS.at(-1) ?? 0) + duracaoUltima
  return { inicioMs, duracaoS, temposS }
}

/** Ordena as janelas pela medição (a API já manda em ordem; a tela não confia nisso). */
export function ordenarJanelas<T extends { medido_em: string }>(janelas: readonly T[]): T[] {
  return [...janelas].sort((a, b) => Date.parse(a.medido_em) - Date.parse(b.medido_em))
}

export function estadoInicial(): EstadoReplay {
  return { posicaoS: 0, velocidade: 1, tocando: false, fim: false }
}

/** Passa `dtRealS` segundos de relógio real; para no fim. */
export function avancar(estado: EstadoReplay, dtRealS: number, duracaoS: number): EstadoReplay {
  if (!estado.tocando || dtRealS <= 0) return estado
  const posicaoS = estado.posicaoS + dtRealS * estado.velocidade
  if (posicaoS >= duracaoS) return { ...estado, posicaoS: duracaoS, tocando: false, fim: true }
  return { ...estado, posicaoS }
}

/** Tocar e pausar. Tocar no fim recomeça do início. */
export function alternar(estado: EstadoReplay): EstadoReplay {
  if (estado.tocando) return { ...estado, tocando: false }
  if (estado.fim) return { ...estado, posicaoS: 0, tocando: true, fim: false }
  return { ...estado, tocando: true }
}

/** Salto para uma posição (cursor arrastado ou teclado), preso ao intervalo. */
export function saltar(estado: EstadoReplay, posicaoS: number, duracaoS: number): EstadoReplay {
  const p = Math.min(duracaoS, Math.max(0, posicaoS))
  return { ...estado, posicaoS: p, fim: p >= duracaoS && duracaoS > 0 }
}

export function mudarVelocidade(estado: EstadoReplay, velocidade: Velocidade): EstadoReplay {
  return { ...estado, velocidade }
}

/** Índice da janela atual (a última já medida no tempo do replay), ou −1 antes da primeira. */
export function indiceAtual(temposS: readonly number[], posicaoS: number): number {
  let baixo = 0
  let alto = temposS.length - 1
  let achado = -1
  while (baixo <= alto) {
    const meio = (baixo + alto) >> 1
    if ((temposS[meio] ?? Number.POSITIVE_INFINITY) <= posicaoS) {
      achado = meio
      baixo = meio + 1
    } else {
      alto = meio - 1
    }
  }
  return achado
}

/**
 * Na posição atual, a janela vigente ainda vale ou já passou o tempo de uma lacuna? Lacuna: desde a
 * janela atual passou mais que 2,5 × o passo normal sem a próxima chegar.
 */
export function emLacuna(temposS: readonly number[], posicaoS: number): boolean {
  const i = indiceAtual(temposS, posicaoS)
  if (i < 0) return false
  const proxima = temposS[i + 1]
  const atual = temposS[i] ?? 0
  return proxima !== undefined && proxima - atual > PASSO_NORMAL_S * FATOR_LACUNA &&
    posicaoS - atual > PASSO_NORMAL_S * FATOR_LACUNA
}

/** Trechos sem janela (para desenhar na linha do tempo): [início, fim] em segundos. */
export function lacunasDaLinha(temposS: readonly number[]): [number, number][] {
  const trechos: [number, number][] = []
  for (let i = 1; i < temposS.length; i++) {
    const a = temposS[i - 1] ?? 0
    const b = temposS[i] ?? 0
    if (b - a > PASSO_NORMAL_S * FATOR_LACUNA) trechos.push([a + PASSO_NORMAL_S, b])
  }
  return trechos
}

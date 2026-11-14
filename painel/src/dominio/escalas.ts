import type { Referencia } from './estado'

/**
 * Escalas do mapa de ordens e da régua de desvio.
 *
 * Mapa de ordens sem referência: cada linha (ponto × grandeza) tem a própria escala, do menor ao
 * maior valor da linha no período; a célula é um tom de cinza proporcional à posição da amplitude
 * nessa faixa (de zero ao máximo, um sinal estável deixaria todas as células no topo). Com
 * referência, o que passa do limite de atenção fica âmbar e o que passa do de alarme, vermelho.
 */

export type EscalaLinha = { minimo: number; maximo: number }

export function escalaDaLinha(valores: readonly (number | null | undefined)[]): EscalaLinha {
  let minimo = Number.POSITIVE_INFINITY
  let maximo = 0
  for (const v of valores) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    if (v > maximo) maximo = v
    if (v < minimo) minimo = v
  }
  return { minimo: Number.isFinite(minimo) ? minimo : 0, maximo }
}

/**
 * Nível de 0 (o menor valor da linha) a 1 (o maior). Linha constante fica no meio (0,5): não há
 * variação para mostrar, mas há dado.
 */
export function nivelDeCinza(valor: number, escala: EscalaLinha): number {
  if (!Number.isFinite(valor)) return 0
  const faixa = escala.maximo - escala.minimo
  if (faixa <= 0) return 0.5
  return Math.min(1, Math.max(0, (valor - escala.minimo) / faixa))
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
  // degraus divisíveis pelas 4 faixas da retícula (0,3 → marcas de 0,075), sem pular de 0,26 para 0,5
  const passos = [1, 2, 3, 4, 5, 6, 8, 10]
  // toPrecision tira o resíduo do ponto flutuante (3 × 0,1 = 0,30000000000000004)
  const teto =
    passos.map((p) => Number((p * ordem).toPrecision(12))).find((p) => p >= maximo * 1.05) ??
    maximo * 1.1
  return [0, teto]
}

/** Passos "redondos" do eixo de tempo, em segundos: 1, 2, 5, 10, 15, 30 s; 1 a 30 min; 1 a 12 h; 1 d. */
const PASSOS_DE_TEMPO_S = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400,
]

/**
 * Marcas do eixo de tempo em horários redondos (04:00, 04:05, 04:10...) em vez de divisões iguais do
 * período (04:02:58, 04:05:57...). Escolhe o menor passo que deixa no máximo `maxMarcas` marcas. O
 * alinhamento é pela hora local (`deslocamentoS` = fuso em segundos, a leste positivo).
 */
export function marcasDeTempo(
  inicioS: number,
  fimS: number,
  maxMarcas: number,
  deslocamentoS = 0,
): { marcas: number[]; passoS: number } {
  if (!(fimS > inicioS) || maxMarcas < 1) return { marcas: [], passoS: 0 }
  const duracao = fimS - inicioS
  const passoS =
    PASSOS_DE_TEMPO_S.find((p) => Math.floor(duracao / p) + 1 <= maxMarcas) ??
    Math.ceil(duracao / maxMarcas / 86_400) * 86_400
  const primeira = Math.ceil((inicioS + deslocamentoS) / passoS) * passoS - deslocamentoS
  const marcas: number[] = []
  for (let t = primeira; t <= fimS + 1e-6; t += passoS) marcas.push(t)
  return { marcas, passoS }
}

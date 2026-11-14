/**
 * Períodos dos gráficos. Períodos curtos usam as janelas brutas; os longos usam a série agregada
 * da API (o período dividido em intervalos iguais), e a tela diz quando é agregado.
 */

export type FonteDaTendencia = 'brutos' | 'agregado'

export type PeriodoTendencia = {
  chave: '15min' | '1h' | '8h' | '24h'
  rotulo: string
  segundos: number
  fonte: FonteDaTendencia
  /** Só no agregado: em quantos intervalos o período é dividido. */
  baldes: number
}

export const PERIODO_TENDENCIA_PADRAO: PeriodoTendencia = {
  chave: '15min',
  rotulo: '15 min',
  segundos: 15 * 60,
  fonte: 'brutos',
  baldes: 0,
}

export const PERIODOS_TENDENCIA: readonly PeriodoTendencia[] = [
  PERIODO_TENDENCIA_PADRAO,
  { chave: '1h', rotulo: '1 h', segundos: 60 * 60, fonte: 'brutos', baldes: 0 },
  { chave: '8h', rotulo: '8 h', segundos: 8 * 60 * 60, fonte: 'agregado', baldes: 480 },
  { chave: '24h', rotulo: '24 h', segundos: 24 * 60 * 60, fonte: 'agregado', baldes: 576 },
]

export type ChavePeriodoTendencia = PeriodoTendencia['chave'] | 'personalizado'

/** Até este tamanho o período personalizado usa janelas brutas. */
export const LIMITE_BRUTOS_S = 60 * 60

export const BALDES_MAXIMO = 600
export const PERIODO_MAXIMO_S = 31 * 24 * 60 * 60

/** Fonte e número de intervalos de um período personalizado (segundos entre "de" e "até"). */
export function planoDoPeriodo(segundos: number): { fonte: FonteDaTendencia; baldes: number } {
  if (segundos <= LIMITE_BRUTOS_S) return { fonte: 'brutos', baldes: 0 }
  // intervalos de pelo menos 1 min, sem passar do máximo da API
  return {
    fonte: 'agregado',
    baldes: Math.min(BALDES_MAXIMO, Math.max(60, Math.round(segundos / 60))),
  }
}

export type ErroDePeriodo = 'incompleto' | 'invertido' | 'longo_demais' | 'no_futuro'

export function validarPeriodo(deMs: number, ateMs: number, agoraMs: number): ErroDePeriodo | null {
  if (!Number.isFinite(deMs) || !Number.isFinite(ateMs)) return 'incompleto'
  if (deMs >= ateMs) return 'invertido'
  if (deMs > agoraMs) return 'no_futuro'
  if ((ateMs - deMs) / 1000 > PERIODO_MAXIMO_S) return 'longo_demais'
  return null
}

export const MENSAGEM_PERIODO: Record<ErroDePeriodo, string> = {
  incompleto: 'Informe o início e o fim.',
  invertido: 'O início precisa ser anterior ao fim.',
  longo_demais: 'O período máximo é de 31 dias.',
  no_futuro: 'O início está no futuro.',
}

export type PeriodoMapa = {
  chave: '30min' | '2h' | '8h'
  rotulo: string
  segundos: number
  baldes: number
}

/** Mapa de ordens: cada célula é um intervalo de tempo. */
export const PERIODO_MAPA_PADRAO: PeriodoMapa = {
  chave: '30min',
  rotulo: '30 min',
  segundos: 30 * 60,
  baldes: 120,
}

export const PERIODOS_MAPA: readonly PeriodoMapa[] = [
  PERIODO_MAPA_PADRAO,
  { chave: '2h', rotulo: '2 h', segundos: 2 * 60 * 60, baldes: 240 },
  { chave: '8h', rotulo: '8 h', segundos: 8 * 60 * 60, baldes: 480 },
]

/** Sparklines da visão geral e da tela da máquina: últimos 15 min em intervalos de 15 s. */
export const SPARKLINE_SEGUNDOS = 15 * 60
export const SPARKLINE_BALDES = 60

/**
 * Arredonda o fim de um período móvel para um múltiplo do passo, para que consultas feitas com
 * segundos de diferença usem o mesmo período (e o mesmo cache).
 */
export function fimAlinhadoMs(agoraMs: number, passoS: number): number {
  const passoMs = passoS * 1000
  return Math.ceil(agoraMs / passoMs) * passoMs
}

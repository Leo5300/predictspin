/**
 * A fita da gravação: um traço por janela recebida, como num gravador. A posição é pelo tempo desde o
 * início do ensaio; a fita mostra pelo menos 2 minutos e cresce com a gravação (nunca para sozinha).
 * Marca própria para janela saturada, com amostras incompletas e evento marcado, e uma marca discreta
 * aos 60 s (duração sugerida pelo protocolo).
 */

export const DURACAO_SUGERIDA_S = 60
export const FITA_MINIMA_S = 120
export const FRACAO_AMOSTRAS_COMPLETA = 0.98

export type JanelaDaFita = {
  id: number
  medido_em: string
  saturou: boolean
  amostras?: number | null
  amostras_esperadas?: number | null
}

export type MarcaDaFita = {
  chave: string
  /** 0 a 1 ao longo da fita. */
  posicao: number
  tipo: 'janela' | 'saturada' | 'incompleta'
}

/** Comprimento da fita em segundos: o mínimo ou o tempo gravado mais uma folga. */
export function comprimentoDaFitaS(decorridoS: number): number {
  if (decorridoS <= FITA_MINIMA_S * 0.9) return FITA_MINIMA_S
  return Math.ceil((decorridoS * 1.15) / 30) * 30
}

export function marcasDaFita(
  janelas: readonly JanelaDaFita[],
  inicioMs: number,
  comprimentoS: number,
): MarcaDaFita[] {
  const vistos = new Set<number>()
  const marcas: MarcaDaFita[] = []
  for (const j of janelas) {
    if (vistos.has(j.id)) continue
    vistos.add(j.id)
    const t = (Date.parse(j.medido_em) - inicioMs) / 1000
    const incompleta =
      j.amostras !== null &&
      j.amostras !== undefined &&
      !!j.amostras_esperadas &&
      j.amostras < FRACAO_AMOSTRAS_COMPLETA * j.amostras_esperadas
    marcas.push({
      chave: String(j.id),
      posicao: Math.min(1, Math.max(0, t / comprimentoS)),
      tipo: j.saturou ? 'saturada' : incompleta ? 'incompleta' : 'janela',
    })
  }
  return marcas.sort((a, b) => a.posicao - b.posicao)
}

export function posicaoNaFita(instante: string | number, inicioMs: number, comprimentoS: number) {
  const ms = typeof instante === 'number' ? instante : Date.parse(instante)
  return Math.min(1, Math.max(0, (ms - inicioMs) / 1000 / comprimentoS))
}

/** Cronômetro: "0:07", "1:05", "1:02:03". */
export function formatarCronometro(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const resto = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${resto}` : `${m}:${resto}`
}

/** Contagem por tipo, para o resumo da fita. */
export function contarMarcas(marcas: readonly MarcaDaFita[]) {
  return {
    janelas: marcas.length,
    saturadas: marcas.filter((m) => m.tipo === 'saturada').length,
    incompletas: marcas.filter((m) => m.tipo === 'incompleta').length,
  }
}

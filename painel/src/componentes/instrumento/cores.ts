/**
 * Cores para os desenhos em canvas (mapa de ordens, gráficos de tendência). O canvas não entende
 * var(--token), então os valores dos tokens semânticos são lidos do documento e relidos quando o
 * tema muda.
 */
import { useSyncExternalStore } from 'react'

import { aoMudarTema, obterTema } from '@/estado/preferencias'

export type CoresDoCanvas = {
  fundo: string
  modulo: string
  rebaixo: string
  linha: string
  linhaForte: string
  texto: string
  apoio: string
  fraco: string
  atencao: string
  alarme: string
  simulado: string
  sinal: string
  reticula: string
  reticulaFina: string
  pontos: [string, string, string]
}

const TOKENS = {
  fundo: '--superficie-fundo',
  modulo: '--superficie-modulo',
  rebaixo: '--superficie-rebaixo',
  linha: '--linha',
  linhaForte: '--linha-forte',
  texto: '--texto',
  apoio: '--texto-apoio',
  fraco: '--texto-fraco',
  atencao: '--estado-atencao',
  alarme: '--estado-alarme',
  simulado: '--simulado',
  sinal: '--sinal',
  reticula: '--reticula',
  reticulaFina: '--reticula-fina',
} as const

let cache: { tema: string; cores: CoresDoCanvas } | null = null

function ler(): CoresDoCanvas {
  const tema = obterTema()
  if (cache?.tema === tema) return cache.cores
  const estilo = getComputedStyle(document.documentElement)
  const valor = (token: string) => estilo.getPropertyValue(token).trim() || 'gray'
  const cores: CoresDoCanvas = {
    fundo: valor(TOKENS.fundo),
    modulo: valor(TOKENS.modulo),
    rebaixo: valor(TOKENS.rebaixo),
    linha: valor(TOKENS.linha),
    linhaForte: valor(TOKENS.linhaForte),
    texto: valor(TOKENS.texto),
    apoio: valor(TOKENS.apoio),
    fraco: valor(TOKENS.fraco),
    atencao: valor(TOKENS.atencao),
    alarme: valor(TOKENS.alarme),
    simulado: valor(TOKENS.simulado),
    sinal: valor(TOKENS.sinal),
    reticula: valor(TOKENS.reticula),
    reticulaFina: valor(TOKENS.reticulaFina),
    pontos: [valor('--ponto-a'), valor('--ponto-b'), valor('--ponto-c')],
  }
  cache = { tema, cores }
  return cores
}

/** Cores do tema atual; o componente redesenha quando o tema muda. */
export function useCoresDoCanvas(): CoresDoCanvas {
  return useSyncExternalStore(aoMudarTema, ler)
}

/**
 * Tom de uma célula do mapa de ordens comparada com o típico da linha. Dentro da faixa morta, todas
 * as células têm o mesmo tom (BASE). Acima do típico, o tom se afasta do fundo de forma contínua
 * (sem degraus) até o MÁXIMO: a mistura vai em direção ao tom do texto, então "mais longe do típico
 * = mais contraste" vale nos dois temas (no grafite fica mais claro; no claro, mais escuro).
 */
const MISTURA_BASE = 26
const MISTURA_MAXIMA = 84

export function tomDaCelula(intensidade: number, cores: CoresDoCanvas): string {
  const t = Math.min(1, Math.max(0, intensidade))
  const parte = Math.round(MISTURA_BASE + (MISTURA_MAXIMA - MISTURA_BASE) * t)
  return `color-mix(in oklch, ${cores.texto} ${parte}%, ${cores.rebaixo})`
}

/** Pontos do padrão "abaixo do típico": discretos, sem competir com o contraste do "acima". */
export function pontoAbaixo(cores: CoresDoCanvas): string {
  return `color-mix(in oklch, ${cores.texto} 70%, ${cores.rebaixo})`
}

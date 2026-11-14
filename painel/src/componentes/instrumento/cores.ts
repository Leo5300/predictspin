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
 * Tom de cinza de uma célula do mapa de ordens: nível 0 é a cor do fundo rebaixado e nível 1 é o
 * tom do texto, misturados em OKLCH.
 */
export function cinzaDoNivel(nivel: number, cores: CoresDoCanvas): string {
  // de 6 % (amplitude zero ainda se distingue da lacuna, que fica vazia) a 62 % (o máximo da linha):
  // o topo da escala não chega ao preto, para a tela continuar calma e a hachura continuar visível
  const parte = Math.round(6 + Math.min(1, Math.max(0, nivel)) * 56)
  return `color-mix(in oklch, ${cores.texto} ${parte}%, ${cores.rebaixo})`
}

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

/** Degraus da rampa de cinza do mapa de ordens. */
export const DEGRAUS_DA_RAMPA = 8

/**
 * Tom de cinza de uma célula do mapa de ordens: a amplitude (0 a 1 da escala da linha) cai em um de
 * 8 degraus. Os degraus são misturas em OKLCH entre o fundo rebaixado e o tom do texto, com passos
 * iguais de luminosidade (perceptualmente uniformes), de 10 % a 72 %: o degrau mais baixo ainda se
 * distingue da lacuna (vazia) e o mais alto não chega à cor do texto nem domina a tela.
 */
export function degrauDoNivel(nivel: number): number {
  return Math.min(
    DEGRAUS_DA_RAMPA - 1,
    Math.floor(Math.min(1, Math.max(0, nivel)) * DEGRAUS_DA_RAMPA),
  )
}

export function cinzaDoNivel(nivel: number, cores: CoresDoCanvas): string {
  const degrau = degrauDoNivel(nivel)
  const parte = Math.round(10 + (degrau * (72 - 10)) / (DEGRAUS_DA_RAMPA - 1))
  return `color-mix(in oklch, ${cores.texto} ${parte}%, ${cores.rebaixo})`
}

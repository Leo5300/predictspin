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
  /** Tema escuro: a rampa do mapa vai do claro (zero) ao escuro (máximo), como no tema claro. */
  escuro: boolean
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
    escuro: tema === 'grafite',
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
 * 8 degraus, com passos iguais de luminosidade em OKLCH (perceptualmente uniformes). Nos dois temas,
 * tom mais escuro = valor maior (é o que o glossário diz). No claro, o degrau sobe do fundo rebaixado
 * para o tom do texto (escuro); no grafite, o texto é claro, então a mistura corre ao contrário: o
 * zero é o cinza mais claro e o máximo o mais escuro, que ainda se distingue da lacuna (vazia, com
 * contorno tracejado). No grafite o degrau do máximo ainda fica bem acima do fundo (28 % do texto),
 * para a máquina saudável não sumir no escuro.
 */
export function degrauDoNivel(nivel: number): number {
  return Math.min(
    DEGRAUS_DA_RAMPA - 1,
    Math.floor(Math.min(1, Math.max(0, nivel)) * DEGRAUS_DA_RAMPA),
  )
}

/** Fração do tom do texto na mistura: no claro sobe de 12 % a 70 %; no grafite desce de 74 % a 28 %. */
const RAMPA_CLARO = [12, 70] as const
const RAMPA_GRAFITE = [74, 28] as const

export function cinzaDoNivel(nivel: number, cores: CoresDoCanvas): string {
  const degrau = degrauDoNivel(nivel)
  const [inicio, fim] = cores.escuro ? RAMPA_GRAFITE : RAMPA_CLARO
  const parte = Math.round(inicio + ((fim - inicio) * degrau) / (DEGRAUS_DA_RAMPA - 1))
  return `color-mix(in oklch, ${cores.texto} ${parte}%, ${cores.rebaixo})`
}

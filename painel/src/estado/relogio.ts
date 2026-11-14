/**
 * Relógios do painel. Um único temporizador de 1 s serve a todos os componentes que mostram idade
 * de dado, contagem regressiva ou hora. O relógio do servidor é estimado a partir das respostas da
 * API, para que prazos (modo rápido) não dependam do acerto do relógio do computador.
 */
import { useSyncExternalStore } from 'react'

export type Instante = {
  /** Relógio monotônico (performance.now), em ms: para medir idade. */
  monotonicoMs: number
  /** Relógio de parede (Date.now), em ms: para mostrar a hora. */
  epocaMs: number
}

let instante: Instante = { monotonicoMs: performance.now(), epocaMs: Date.now() }
const ouvintes = new Set<() => void>()
let temporizador: ReturnType<typeof setInterval> | null = null

function bater() {
  instante = { monotonicoMs: performance.now(), epocaMs: Date.now() }
  ouvintes.forEach((ouvinte) => ouvinte())
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  if (!temporizador) {
    bater()
    temporizador = setInterval(bater, 1000)
  }
  return () => {
    ouvintes.delete(ouvinte)
    if (ouvintes.size === 0 && temporizador) {
      clearInterval(temporizador)
      temporizador = null
    }
  }
}

/** O instante atual, renovado a cada segundo. */
export function useSegundo(): Instante {
  return useSyncExternalStore(assinar, () => instante)
}

/** Relógio de parede, para manipuladores de evento (fora do render). */
export function agoraMs(): number {
  return Date.now()
}

let desvioDoServidorMs = 0

/** Registra a diferença (servidor − navegador) estimada por uma resposta da API. */
export function registrarDesvioDoServidor(desvioMs: number) {
  if (Number.isFinite(desvioMs)) desvioDoServidorMs = desvioMs
}

/** O "agora" do servidor, estimado. */
export function agoraDoServidorMs(epocaMs: number = Date.now()): number {
  return epocaMs + desvioDoServidorMs
}

/**
 * Saúde da conexão com a API. Toda chamada registra aqui se deu certo ou falhou; quando começa a
 * falhar, uma sonda bate em /actuator/health com espera crescente até a API responder. A interface
 * lê o estado ("API ok", "API acordando", "sem conexão") e a contagem para a próxima tentativa.
 */
import { useSyncExternalStore } from 'react'

import { esperaDaTentativaS, type SituacaoDaRede } from '@/dominio/conexao'

export type Saude = SituacaoDaRede & {
  /** Número da próxima tentativa da sonda (0 se não está sondando). */
  tentativa: number
  /** Instante (Date.now) da próxima tentativa; nulo se não há tentativa marcada. */
  proximaTentativaEmMs: number | null
}

let saude: Saude = {
  navegadorConectado: typeof navigator === 'undefined' ? true : navigator.onLine,
  falhandoDesdeMs: null,
  tentativa: 0,
  proximaTentativaEmMs: null,
}

const ouvintes = new Set<() => void>()
const aoVoltar = new Set<() => void>()
let temporizador: ReturnType<typeof setTimeout> | null = null
let enderecoDaSonda: string | null = null

function publicar(nova: Saude) {
  saude = nova
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function obterSaude(): Saude {
  return saude
}

export function useSaude(): Saude {
  return useSyncExternalStore((ouvinte) => {
    ouvintes.add(ouvinte)
    return () => ouvintes.delete(ouvinte)
  }, obterSaude)
}

/** Chamado quando a API volta a responder depois de falhar (para refazer as consultas). */
export function aoApiVoltar(ouvinte: () => void): () => void {
  aoVoltar.add(ouvinte)
  return () => aoVoltar.delete(ouvinte)
}

export function configurarSonda(urlDaApi: string) {
  enderecoDaSonda = `${urlDaApi}/actuator/health`
}

export function registrarSucesso() {
  if (temporizador) {
    clearTimeout(temporizador)
    temporizador = null
  }
  if (saude.falhandoDesdeMs === null) return
  publicar({ ...saude, falhandoDesdeMs: null, tentativa: 0, proximaTentativaEmMs: null })
  aoVoltar.forEach((ouvinte) => ouvinte())
}

/** Uma resposta está demorando além do normal: a API pode estar acordando. */
export function registrarDemora() {
  if (saude.falhandoDesdeMs !== null) return
  publicar({ ...saude, falhandoDesdeMs: Date.now() })
}

export function registrarFalha() {
  if (saude.falhandoDesdeMs === null) {
    publicar({ ...saude, falhandoDesdeMs: Date.now() })
  }
  marcarSonda()
}

function marcarSonda() {
  if (temporizador || !enderecoDaSonda) return
  const tentativa = saude.tentativa + 1
  const esperaMs = esperaDaTentativaS(tentativa) * 1000
  publicar({ ...saude, tentativa, proximaTentativaEmMs: Date.now() + esperaMs })
  temporizador = setTimeout(() => {
    temporizador = null
    void sondar()
  }, esperaMs)
}

async function sondar() {
  if (!enderecoDaSonda) return
  try {
    const resposta = await fetch(enderecoDaSonda, { cache: 'no-store' })
    if (resposta.ok) {
      registrarSucesso()
      return
    }
  } catch {
    /* ainda fora do ar */
  }
  marcarSonda()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    publicar({ ...saude, navegadorConectado: true })
    if (saude.falhandoDesdeMs !== null) void sondar()
  })
  window.addEventListener('offline', () => {
    publicar({ ...saude, navegadorConectado: false })
  })
}

/**
 * Saúde da conexão com a API. Toda chamada registra aqui se deu certo ou falhou; quando começa a
 * falhar, uma sonda bate em /actuator/health com espera crescente até a API responder. A rede do
 * aparelho vem do expo-network: sem rede, é "sem conexão" na hora, sem esperar a API acordar.
 */
import * as Network from 'expo-network'
import { useSyncExternalStore } from 'react'

import { esperaDaTentativaS, type SituacaoDaRede } from '@/dominio/conexao'

import { URL_API } from './configuracao'

export type Saude = SituacaoDaRede & {
  /** Número da próxima tentativa da sonda (0 se não está sondando). */
  tentativa: number
}

let saude: Saude = { aparelhoConectado: true, falhandoDesdeMs: null, tentativa: 0 }

const ouvintes = new Set<() => void>()
const aoVoltar = new Set<() => void>()
let temporizador: ReturnType<typeof setTimeout> | null = null

function publicar(nova: Saude) {
  saude = nova
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function obterSaude(): Saude {
  return saude
}

export function assinarSaude(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function useSaude(): Saude {
  return useSyncExternalStore(assinarSaude, obterSaude)
}

/** Chamado quando a API volta a responder depois de falhar (para refazer as consultas). */
export function aoApiVoltar(ouvinte: () => void): () => void {
  aoVoltar.add(ouvinte)
  return () => aoVoltar.delete(ouvinte)
}

function pararSonda() {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
}

export function registrarSucesso() {
  pararSonda()
  if (saude.falhandoDesdeMs === null) return
  publicar({ ...saude, falhandoDesdeMs: null, tentativa: 0 })
  aoVoltar.forEach((ouvinte) => ouvinte())
}

export function registrarFalha() {
  if (saude.falhandoDesdeMs !== null) return
  publicar({ ...saude, falhandoDesdeMs: Date.now(), tentativa: 1 })
  agendarSonda()
}

function agendarSonda() {
  pararSonda()
  temporizador = setTimeout(() => void sondar(), esperaDaTentativaS(saude.tentativa) * 1000)
}

async function sondar() {
  try {
    const resposta = await fetch(`${URL_API}/actuator/health`, {
      headers: { Accept: 'application/json' },
    })
    if (resposta.ok) {
      registrarSucesso()
      return
    }
  } catch {
    /* ainda fora */
  }
  if (saude.falhandoDesdeMs === null) return
  publicar({ ...saude, tentativa: saude.tentativa + 1 })
  agendarSonda()
}

export function definirRedeDoAparelho(conectado: boolean) {
  if (conectado === saude.aparelhoConectado) return
  publicar({ ...saude, aparelhoConectado: conectado })
  // a rede voltou: tenta a API já, sem esperar a próxima sonda
  if (conectado && saude.falhandoDesdeMs !== null) void sondar()
}

/** Acompanha a rede do aparelho; devolve a função que para. */
export function vigiarRedeDoAparelho(): () => void {
  void Network.getNetworkStateAsync()
    .then((estado) => definirRedeDoAparelho(estado.isConnected !== false))
    .catch(() => undefined)
  const assinatura = Network.addNetworkStateListener((estado) =>
    definirRedeDoAparelho(estado.isConnected !== false),
  )
  return () => assinatura.remove()
}

/** Só para testes. */
export function reiniciarSaudeParaTeste() {
  pararSonda()
  saude = { aparelhoConectado: true, falhandoDesdeMs: null, tentativa: 0 }
  aoVoltar.clear()
}

/**
 * Ganchos pequenos usados por várias telas: app em primeiro plano, relógio que anda, tema em uso e
 * estado da conexão.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useUniwind } from 'uniwind'

import { agoraMonotonicoMs } from '@/api/relogio'
import { useSaude } from '@/api/saude'
import { estadoDaConexao, indicadorDaConexao, type IndicadorConexao } from '@/dominio/conexao'
import { useTransporte } from '@/estado/aoVivo'
import { CORES, type Cores } from '@/tema/tokens'

function assinarAppState(ouvinte: () => void) {
  const assinatura = AppState.addEventListener('change', ouvinte)
  return () => assinatura.remove()
}

/** true com o app na frente; em segundo plano (ou durante a troca de app) é false. */
export function useAppAtivo(): boolean {
  return useSyncExternalStore(assinarAppState, () => AppState.currentState === 'active')
}

/** Relógio monotônico que avança a cada intervalo (para "há X s" e o dado velho). */
export function useAgora(intervaloMs = 1000): number {
  const [agora, setAgora] = useState(agoraMonotonicoMs)
  useEffect(() => {
    const id = setInterval(() => setAgora(agoraMonotonicoMs()), intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs])
  return agora
}

/** Relógio de parede (Date.now) que avança a cada intervalo, para "há quanto tempo" de instantes da API. */
export function useAgoraParede(intervaloMs = 15_000): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs])
  return agora
}

/** Cores do tema em uso, para SVG e o que precisa da cor em JS. */
export function useCores(): Cores {
  const { theme } = useUniwind()
  return theme === 'dark' ? CORES.grafite : CORES.claro
}

/** Conexão com a API para a barra superior e para habilitar as ações que escrevem. */
export function useConexao(): IndicadorConexao {
  const saude = useSaude()
  const transporte = useTransporte()
  // o relógio de parede faz "acordando" virar "sem conexão" depois do tempo esperado
  const agora = useAgoraParede(5000)
  return indicadorDaConexao(estadoDaConexao(saude, agora), transporte)
}

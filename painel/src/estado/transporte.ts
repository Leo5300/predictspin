/**
 * Como os dados estão chegando na tela aberta (para a barra superior): por eventos ao vivo, por
 * consulta periódica ou nada (tela sem dado de máquina). Guarda também a observação da última
 * janela, que alimenta o "última janela há X s".
 */
import { useSyncExternalStore } from 'react'

import type { Observacao } from '@/dominio/idade'

export type Transporte = 'eventos' | 'consulta' | 'inativo'

type Estado = {
  transporte: Transporte
  ultima: Observacao | null
  /** Limite de dado velho da tela aberta: 15 s, ou 4 s com o modo rápido valendo. */
  limiarS: number
  /** Algum gráfico da tela está em AO VIVO (modo rápido pedido por este painel). */
  aoVivo: boolean
}

let estado: Estado = { transporte: 'inativo', ultima: null, limiarS: 15, aoVivo: false }
const ouvintes = new Set<() => void>()

function publicar(novo: Estado) {
  estado = novo
  ouvintes.forEach((ouvinte) => ouvinte())
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function useTransporte(): Transporte {
  return useSyncExternalStore(assinar, () => estado.transporte)
}

export function useUltimaObservacao(): Observacao | null {
  return useSyncExternalStore(assinar, () => estado.ultima)
}

export function useLimiarVelhoS(): number {
  return useSyncExternalStore(assinar, () => estado.limiarS)
}

export function useAoVivo(): boolean {
  return useSyncExternalStore(assinar, () => estado.aoVivo)
}

export function definirLimiarVelhoS(limiarS: number) {
  if (estado.limiarS !== limiarS) publicar({ ...estado, limiarS })
}

export function definirAoVivo(aoVivo: boolean) {
  if (estado.aoVivo !== aoVivo) publicar({ ...estado, aoVivo })
}

export function definirTransporte(transporte: Transporte) {
  if (estado.transporte !== transporte) publicar({ ...estado, transporte })
}

/** Informa a observação mais recente da tela; nulo quando a tela não tem dado. */
export function definirUltimaObservacao(ultima: Observacao | null) {
  const atual = estado.ultima
  const igual =
    atual === ultima ||
    (atual !== null &&
      ultima !== null &&
      atual.observadoEmMs === ultima.observadoEmMs &&
      atual.idadeNaObservacaoS === ultima.idadeNaObservacaoS)
  if (!igual) publicar({ ...estado, ultima })
}

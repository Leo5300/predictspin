/**
 * Como os dados estão chegando na tela aberta (para a barra superior): por eventos ao vivo, por
 * consulta periódica ou nada (tela sem dado de máquina). Guarda também a observação da última
 * janela, que alimenta o "última janela há X s".
 */
import { useSyncExternalStore } from 'react'

import type { Observacao } from '@/dominio/idade'

export type Transporte = 'eventos' | 'consulta' | 'inativo'

type Estado = { transporte: Transporte; ultima: Observacao | null }

let estado: Estado = { transporte: 'inativo', ultima: null }
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

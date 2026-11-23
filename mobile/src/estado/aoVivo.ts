/**
 * Estado dos eventos ao vivo, para a barra superior e para as consultas decidirem se precisam
 * consultar a cada 5 s: "ao vivo" (SSE conectado), "conectando" ou "reconectando".
 */
import { useSyncExternalStore } from 'react'

import type { Transporte } from '@/dominio/conexao'

let transporte: Transporte = 'conectando'
const ouvintes = new Set<() => void>()

export function definirTransporte(novo: Transporte) {
  if (novo === transporte) return
  transporte = novo
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function obterTransporte(): Transporte {
  return transporte
}

export function useTransporte(): Transporte {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    () => transporte,
  )
}

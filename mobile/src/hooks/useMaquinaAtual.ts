import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { consultaMaquinas } from '@/api/consultas'
import type { Maquina } from '@/api/tipos'

/** Máquina aberta por último; com uma só máquina cadastrada, é sempre ela. */
let escolhida: number | null = null
const ouvintes = new Set<() => void>()

export function escolherMaquina(id: number) {
  if (escolhida === id) return
  escolhida = id
  ouvintes.forEach((ouvinte) => ouvinte())
}

function useEscolhida(): number | null {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    () => escolhida,
  )
}

/**
 * A máquina dos eventos ao vivo e da barra superior: a escolhida, ou a primeira ativa da lista. Hoje
 * só existe o TORNO-01.
 */
export function useMaquinaAtual(): Maquina | null {
  const maquinas = useQuery(consultaMaquinas())
  const id = useEscolhida()
  const lista = maquinas.data?.conteudo ?? []
  return lista.find((m) => m.id === id) ?? lista.find((m) => m.ativa) ?? lista[0] ?? null
}

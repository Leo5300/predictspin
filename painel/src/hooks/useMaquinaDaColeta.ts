import { useQuery } from '@tanstack/react-query'

import { consultaMaquinas } from '@/api/consultas'

/** Máquina da coleta: a pedida na URL ou a primeira da lista. */
export function useMaquinaDaColeta(escolhida: number | undefined) {
  const maquinas = useQuery(consultaMaquinas())
  const id = escolhida ?? maquinas.data?.conteudo[0]?.id
  return { maquinas, id }
}

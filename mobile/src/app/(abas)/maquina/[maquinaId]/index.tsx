import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import { consultaMaquinas } from '@/api/consultas'
import { Mensagem } from '@/componentes/Basicos'
import { escolherMaquina } from '@/hooks/useMaquinaAtual'
import { TelaMaquina } from '@/telas/TelaMaquina'

export default function RotaMaquina() {
  const { maquinaId } = useLocalSearchParams<{ maquinaId: string }>()
  const id = Number(maquinaId)
  const maquinas = useQuery(consultaMaquinas())
  const varias = (maquinas.data?.conteudo.filter((m) => m.ativa).length ?? 0) > 1
  useEffect(() => {
    if (Number.isInteger(id)) escolherMaquina(id)
  }, [id])
  if (!Number.isInteger(id)) return <Mensagem titulo="Máquina não encontrada." />
  return <TelaMaquina maquinaId={id} comVoltar={varias} />
}

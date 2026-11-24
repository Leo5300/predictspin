import { useLocalSearchParams } from 'expo-router'

import { Mensagem } from '@/componentes/Basicos'
import { TelaDetalheModelo } from '@/telas/TelaModelos'

export default function RotaModelo() {
  const { modeloId } = useLocalSearchParams<{ modeloId: string }>()
  const id = Number(modeloId)
  if (!Number.isInteger(id)) return <Mensagem titulo="Versão não encontrada." />
  return <TelaDetalheModelo modeloId={id} />
}

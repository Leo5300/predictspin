import { useLocalSearchParams } from 'expo-router'

import { Mensagem } from '@/componentes/Basicos'
import { TelaDetalheOrdem } from '@/telas/TelaDetalheOrdem'

export default function RotaOrdem() {
  const { osId } = useLocalSearchParams<{ osId: string }>()
  const id = Number(osId)
  if (!Number.isInteger(id)) return <Mensagem titulo="OS não encontrada." />
  return <TelaDetalheOrdem osId={id} />
}

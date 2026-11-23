import { useLocalSearchParams } from 'expo-router'

import { Mensagem } from '@/componentes/Basicos'
import { TelaPonto } from '@/telas/TelaPonto'

export default function RotaPonto() {
  const { maquinaId, ponto } = useLocalSearchParams<{ maquinaId: string; ponto: string }>()
  const id = Number(maquinaId)
  if (!Number.isInteger(id) || !ponto) return <Mensagem titulo="Ponto não encontrado." />
  return <TelaPonto maquinaId={id} codigo={ponto} />
}

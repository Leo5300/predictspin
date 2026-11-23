import { useLocalSearchParams } from 'expo-router'

import { Mensagem } from '@/componentes/Basicos'
import { TelaDetalheAlarme } from '@/telas/TelaDetalheAlarme'

export default function RotaAlarme() {
  const { alertaId } = useLocalSearchParams<{ alertaId: string }>()
  const id = Number(alertaId)
  if (!Number.isInteger(id)) return <Mensagem titulo="Alarme não encontrado." />
  return <TelaDetalheAlarme alertaId={id} />
}

import { useQuery } from '@tanstack/react-query'

import {
  consultaAlarmes,
  consultaUltimaJanela,
  INTERVALO_DE_CONSULTA_MS,
  type UltimaObservada,
} from '@/api/consultas'
import { frescor, idadeEmSegundos, limiarVelhoS, type Frescor } from '@/dominio/idade'
import { useTransporte } from '@/estado/aoVivo'

import { useAgora } from './basicos'

/**
 * Última janela da máquina e a idade dela. Com os eventos ao vivo a janela chega pelo SSE; enquanto
 * eles reconectam, consulta a cada 5 s. O modo rápido conta como ativo quando a última janela veio
 * rápida (o app não liga o modo rápido: isso é do painel).
 */
export function useUltimaJanela(maquinaId: number | undefined, simulado: boolean) {
  const transporte = useTransporte()
  const consulta = useQuery({
    ...consultaUltimaJanela(maquinaId ?? 0, simulado),
    enabled: maquinaId !== undefined,
    refetchInterval: transporte === 'ao_vivo' ? false : INTERVALO_DE_CONSULTA_MS,
  })
  const agora = useAgora(1000)
  const dado: UltimaObservada = consulta.data ?? null
  const idadeS = dado ? idadeEmSegundos(dado.observacao, agora) : null
  const modo = dado?.janela.modo ?? 'normal'
  const estado: Frescor = consulta.isPending && maquinaId !== undefined && !consulta.isError
    ? 'ausente'
    : frescor(dado?.observacao ?? null, agora, limiarVelhoS(modo, modo === 'rapido'))
  return { consulta, janela: dado?.janela ?? null, idadeS, frescor: estado }
}

/** Lista de alarmes da fonte, consultada a cada 5 s só enquanto os eventos ao vivo estão fora. */
export function useAlarmes(simulado: boolean) {
  const transporte = useTransporte()
  return useQuery({
    ...consultaAlarmes(simulado),
    refetchInterval: transporte === 'ao_vivo' ? false : INTERVALO_DE_CONSULTA_MS,
  })
}

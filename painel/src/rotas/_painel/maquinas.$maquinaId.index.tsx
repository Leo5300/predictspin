import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { TelaMaquina } from '@/telas/maquina/TelaMaquina'

const busca = z.object({
  /** Período do mapa de ordens. */
  mapa: z.enum(['30min', '2h', '8h']).default('30min').catch('30min'),
})

export const Route = createFileRoute('/_painel/maquinas/$maquinaId/')({
  validateSearch: busca,
  params: {
    parse: (parametros) => {
      const maquinaId = Number(parametros.maquinaId)
      if (!Number.isInteger(maquinaId) || maquinaId <= 0) throw notFound()
      return { maquinaId }
    },
    stringify: (parametros) => ({ maquinaId: String(parametros.maquinaId) }),
  },
  component: RotaMaquina,
})

function RotaMaquina() {
  const { maquinaId } = Route.useParams()
  const { mapa } = Route.useSearch()
  return <TelaMaquina maquinaId={maquinaId} periodoDoMapa={mapa} />
}

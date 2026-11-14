import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { TelaPonto } from '@/telas/ponto/TelaPonto'

const busca = z.object({
  periodo: z.enum(['15min', '1h', '8h', '24h', 'personalizado']).default('15min').catch('15min'),
  /** Só no período personalizado: início e fim em ISO-8601. */
  de: z.string().optional().catch(undefined),
  ate: z.string().optional().catch(undefined),
  /** Segundo quadro do gráfico: curtose ou ordens 1X–3X. */
  quadro: z.enum(['ordens', 'curtose']).default('ordens').catch('ordens'),
  pagina: z.number().int().min(0).default(0).catch(0),
})

export type BuscaDoPonto = z.infer<typeof busca>

export const Route = createFileRoute('/_painel/maquinas/$maquinaId/pontos/$codigo')({
  validateSearch: busca,
  params: {
    parse: (parametros) => {
      const maquinaId = Number(parametros.maquinaId)
      if (!Number.isInteger(maquinaId) || maquinaId <= 0) throw notFound()
      return { maquinaId, codigo: parametros.codigo }
    },
    stringify: (parametros) => ({
      maquinaId: String(parametros.maquinaId),
      codigo: parametros.codigo,
    }),
  },
  component: RotaPonto,
})

function RotaPonto() {
  const { maquinaId, codigo } = Route.useParams()
  const busca = Route.useSearch()
  return <TelaPonto maquinaId={maquinaId} codigo={codigo} busca={busca} />
}

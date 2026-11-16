import { createFileRoute, notFound } from '@tanstack/react-router'

import { ExigePapel } from '@/telas/apoio/TelasDeApoio'
import { TelaReplay } from '@/telas/coleta/TelaReplay'

export const Route = createFileRoute('/_painel/coleta/ensaios/$ensaioId/replay')({
  params: {
    parse: (p) => {
      const ensaioId = Number(p.ensaioId)
      if (!Number.isInteger(ensaioId) || ensaioId <= 0) throw notFound()
      return { ensaioId }
    },
    stringify: (p) => ({ ensaioId: String(p.ensaioId) }),
  },
  component: RotaReplay,
})

function RotaReplay() {
  const { ensaioId } = Route.useParams()
  return (
    <ExigePapel area="ensaios">
      <TelaReplay ensaioId={ensaioId} />
    </ExigePapel>
  )
}

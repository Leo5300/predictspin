import { createFileRoute } from '@tanstack/react-router'

import { TelaDetalheOs } from '@/telas/alarmes/TelaDetalheOs'
import { ExigePapel } from '@/telas/apoio/TelasDeApoio'

export const Route = createFileRoute('/_painel/ordens/$osId')({
  component: RotaDetalheOs,
})

function RotaDetalheOs() {
  const { osId } = Route.useParams()
  return (
    <ExigePapel area="alarmes">
      <TelaDetalheOs id={Number(osId)} />
    </ExigePapel>
  )
}

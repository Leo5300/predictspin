import { createFileRoute } from '@tanstack/react-router'

import { TelaDetalheAlerta } from '@/telas/alarmes/TelaDetalheAlerta'
import { ExigePapel } from '@/telas/apoio/TelasDeApoio'

export const Route = createFileRoute('/_painel/alarmes_/$alertaId')({
  component: RotaDetalheAlerta,
})

function RotaDetalheAlerta() {
  const { alertaId } = Route.useParams()
  return (
    <ExigePapel area="alarmes">
      <TelaDetalheAlerta id={Number(alertaId)} />
    </ExigePapel>
  )
}

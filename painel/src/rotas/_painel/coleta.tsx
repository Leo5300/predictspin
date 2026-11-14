import { createFileRoute } from '@tanstack/react-router'

import { ExigePapel } from '@/telas/apoio/TelasDeApoio'
import { TelaColeta } from '@/telas/coleta/TelaColeta'

export const Route = createFileRoute('/_painel/coleta')({
  component: RotaColeta,
})

function RotaColeta() {
  return (
    <ExigePapel area="coleta">
      <TelaColeta />
    </ExigePapel>
  )
}

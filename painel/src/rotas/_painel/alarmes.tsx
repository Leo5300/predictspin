import { createFileRoute } from '@tanstack/react-router'

import { ExigePapel } from '@/telas/apoio/TelasDeApoio'
import { TelaAlarmes } from '@/telas/alarmes/TelaAlarmes'

export const Route = createFileRoute('/_painel/alarmes')({
  component: () => (
    <ExigePapel area="alarmes">
      <TelaAlarmes />
    </ExigePapel>
  ),
})

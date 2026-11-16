import { createFileRoute } from '@tanstack/react-router'

import { ExigePapel } from '@/telas/apoio/TelasDeApoio'
import { TelaDiagnostico } from '@/telas/diagnostico/TelaDiagnostico'

export const Route = createFileRoute('/_painel/diagnostico')({
  component: () => (
    <ExigePapel area="diagnostico">
      <TelaDiagnostico />
    </ExigePapel>
  ),
})

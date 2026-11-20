import { createFileRoute } from '@tanstack/react-router'

import { ExigePapel } from '@/telas/apoio/TelasDeApoio'
import { TelaModelos } from '@/telas/modelos/TelaModelos'

export const Route = createFileRoute('/_painel/coleta/modelos')({
  component: () => (
    <ExigePapel area="modelos">
      <TelaModelos />
    </ExigePapel>
  ),
})

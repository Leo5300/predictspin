import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { ExigePapel } from '@/telas/apoio/TelasDeApoio'
import { TelaColeta } from '@/telas/coleta/TelaColeta'

const busca = z.object({
  /** Máquina da coleta; sem ela, a primeira da lista. */
  maquina: z.number().int().positive().optional().catch(undefined),
  /** Resumo de uma gravação que acabou de ser encerrada. */
  resumo: z.number().int().positive().optional().catch(undefined),
})

export type BuscaDaColeta = z.infer<typeof busca>

export const Route = createFileRoute('/_painel/coleta/')({
  validateSearch: busca,
  component: RotaColeta,
})

function RotaColeta() {
  const { maquina, resumo } = Route.useSearch()
  return (
    <ExigePapel area="coleta">
      <TelaColeta maquinaEscolhida={maquina} resumo={resumo} />
    </ExigePapel>
  )
}

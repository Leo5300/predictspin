import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { CONDICOES, ETAPAS } from '@/dominio/coleta'
import { ExigePapel } from '@/telas/apoio/TelasDeApoio'
import { TelaPreparar } from '@/telas/coleta/TelaPreparar'

const busca = z.object({
  maquina: z.number().int().positive().optional().catch(undefined),
  etapa: z
    .enum(ETAPAS as [string, ...string[]])
    .optional()
    .catch(undefined),
  condicao: z
    .enum(CONDICOES as [string, ...string[]])
    .optional()
    .catch(undefined),
  rotacao: z.number().int().min(0).max(30000).optional().catch(undefined),
  /** Veio da sessão encadeada (a receita e a sequência já estão montadas). */
  sessao: z.boolean().optional().catch(undefined),
})

export type BuscaDoPreparo = z.infer<typeof busca>

export const Route = createFileRoute('/_painel/coleta/preparar')({
  validateSearch: busca,
  component: RotaPreparar,
})

function RotaPreparar() {
  const b = Route.useSearch()
  return (
    <ExigePapel area="coleta">
      <TelaPreparar busca={b} />
    </ExigePapel>
  )
}

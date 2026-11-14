import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { CONDICOES, ETAPAS } from '@/dominio/coleta'
import { ExigePapel } from '@/telas/apoio/TelasDeApoio'
import { TelaEnsaios } from '@/telas/coleta/TelaEnsaios'

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
  material: z.number().int().positive().optional().catch(undefined),
  ferramenta: z.number().int().positive().optional().catch(undefined),
  estado: z.enum(['todos', 'abertos', 'encerrados', 'descartados']).default('todos').catch('todos'),
  pagina: z.number().int().min(0).default(0).catch(0),
  /** Ensaio aberto em detalhe (receita, eventos, histórico, correção). */
  ensaio: z.number().int().positive().optional().catch(undefined),
})

export type BuscaDosEnsaios = z.infer<typeof busca>

export const Route = createFileRoute('/_painel/coleta/ensaios/')({
  validateSearch: busca,
  component: RotaEnsaios,
})

function RotaEnsaios() {
  const b = Route.useSearch()
  return (
    <ExigePapel area="ensaios">
      <TelaEnsaios busca={b} />
    </ExigePapel>
  )
}

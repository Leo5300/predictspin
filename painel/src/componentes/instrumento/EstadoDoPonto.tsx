import { Explica } from '@/componentes/ui/explica'
import { ROTULO_SITUACAO, avaliacaoDoPonto, situacaoDoPonto, type Situacao } from '@/dominio/estado'
import type { ChaveDoGlossario } from '@/dominio/glossario'
import { cn } from '@/lib/utils'

import { SeloAvaliacao } from './Selos'

const EXPLICA_DA_SITUACAO: Record<Exclude<Situacao, 'avaliada'>, ChaveDoGlossario> = {
  sem_referencia: 'referencia',
  sem_referencia_completa: 'sem_referencia_completa',
  calibracao_diferente: 'calibracao_diferente',
  nao_avaliavel: 'saturacao',
}

/** O mínimo que a API manda sobre a avaliação de um ponto (na janela ou na avaliação detalhada). */
export type AvaliacaoResumida = {
  situacao: string
  estado?: string | null
  generica?: boolean
}

/**
 * Estado de um ponto: NORMAL, ATENÇÃO ou ALARME (cor + forma + texto) quando a API o comparou com a
 * referência; senão um selo neutro que diz por quê (sem referência, sem referência completa,
 * calibração diferente, não avaliável), cada um com o seu "?". "Referência genérica" acompanha o
 * estado quando o corte foi comparado com todas as receitas juntas.
 */
export function EstadoDoPonto({
  avaliacao,
  className,
}: {
  avaliacao: AvaliacaoResumida | null | undefined
  className?: string
}) {
  const situacao = situacaoDoPonto(avaliacao)
  if (situacao !== 'avaliada') {
    return (
      <span className={cn('inline-flex items-center gap-1', className)} data-situacao={situacao}>
        <span className="inline-flex h-6 shrink-0 items-center border border-dashed border-linha-forte px-1.5 text-12 font-medium tracking-[0.06em] whitespace-nowrap text-apoio uppercase">
          {ROTULO_SITUACAO[situacao]}
        </span>
        <Explica chave={EXPLICA_DA_SITUACAO[situacao]} />
      </span>
    )
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <SeloAvaliacao avaliacao={avaliacaoDoPonto(avaliacao)} />
      <Explica chave="atencao_alarme" />
      {avaliacao?.generica ? (
        <span className="inline-flex items-center gap-1 text-12 text-apoio">
          referência genérica <Explica chave="referencia_generica" />
        </span>
      ) : null}
    </span>
  )
}

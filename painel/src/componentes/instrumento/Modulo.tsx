import type { ReactNode } from 'react'

import { Explica } from '@/componentes/ui/explica'
import type { ChaveDoGlossario } from '@/dominio/glossario'
import { cn } from '@/lib/utils'

import { SeloGravado, SeloSim } from './SeloSim'

type PropsDoPainel = {
  children: ReactNode
  className?: string
}

/**
 * Face do instrumento: os módulos ficam lado a lado separados por linhas de 1 px (a cor da linha é
 * o fundo da grade, visto pelas frestas). Não há cartão solto nem sombra.
 */
export function Painel({ children, className }: PropsDoPainel) {
  return <div className={cn('grid gap-px border border-linha bg-linha', className)}>{children}</div>
}

type PropsDoModulo = {
  /** Rótulo curto em caixa-alta no cabeçalho. */
  rotulo: string
  /** Termo do glossário: "?" ao lado do rótulo. */
  explica?: ChaveDoGlossario
  /** Texto complementar ao lado do rótulo (não repete o rótulo). */
  detalhe?: ReactNode
  /** Controles do módulo, à direita do cabeçalho. */
  acoes?: ReactNode
  /** Dado simulado: o cabeçalho ganha o selo SIM (a hachura fica na faixa do topo e no mapa). */
  simulado?: boolean
  /** Dado gravado (replay): o cabeçalho ganha o selo GRAVADO. */
  gravado?: boolean
  /** Sem recuo interno (gráficos e tabelas que encostam nas bordas). */
  semRecuo?: boolean
  className?: string
  children: ReactNode
}

/** Módulo: uma região do painel com rótulo e conteúdo. É um contêiner (@container) para o que vai dentro. */
export function Modulo({
  rotulo,
  explica,
  detalhe,
  acoes,
  simulado = false,
  gravado = false,
  semRecuo = false,
  className,
  children,
}: PropsDoModulo) {
  return (
    <section
      aria-label={rotulo}
      data-simulado={simulado || undefined}
      className={cn('@container flex min-w-0 flex-col bg-modulo', className)}
    >
      <header className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 border-b border-linha px-3 py-1">
        {/* o rótulo quebra a linha em vez de ser cortado (é o que identifica o módulo) */}
        <h2 className="rotulo min-w-0 [overflow-wrap:anywhere]">{rotulo}</h2>
        {explica ? <Explica chave={explica} className="-ml-1.5" /> : null}
        {simulado ? <SeloSim /> : null}
        {gravado ? <SeloGravado /> : null}
        {detalhe ? (
          // módulo estreito: o detalhe desce para uma linha própria e quebra, em vez de virar "f…"
          <div
            className="min-w-0 flex-1 truncate text-12 text-apoio @max-[36rem]:order-last @max-[36rem]:basis-full @max-[36rem]:whitespace-normal"
            title={typeof detalhe === 'string' ? detalhe : undefined}
          >
            {detalhe}
          </div>
        ) : null}
        {acoes ? (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>
        ) : null}
      </header>
      <div className={cn('min-w-0 flex-1', !semRecuo && 'p-3')}>{children}</div>
    </section>
  )
}

import { useState } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/componentes/ui/tooltip'
import { cn } from '@/lib/utils'

type Tamanho = 'pequeno' | 'medio' | 'grande' | 'destaque'

const CLASSE_DO_VALOR: Record<Tamanho, string> = {
  pequeno: 'text-15',
  medio: 'text-18',
  grande: 'text-24',
  destaque: 'text-40',
}

type Props = {
  /** Rótulo curto em caixa-alta (RMS, PICO, CURT, 1X...). */
  rotulo: string
  /** O rótulo por extenso, mostrado ao passar o cursor ou com foco (ex.: "curtose" para CURT). */
  titulo?: string
  /** Valor já formatado em pt-BR. */
  valor: string
  /** Unidade em cinza ao lado do valor, com cerca de 70% do tamanho dele. */
  unidade?: string
  tamanho?: Tamanho
  /** Dado velho: o valor fica no tom fraco e sem peso. */
  velho?: boolean
  className?: string
}

/**
 * Leitura de instrumento: rótulo pequeno em cima, valor mono tabular embaixo e a unidade ao lado.
 * O valor troca seco (nunca conta). Quando muda, um traço de 1 px na cor de sinal aparece sob ele
 * e some em 400 ms.
 */
export function Leitura({
  rotulo,
  titulo,
  valor,
  unidade,
  tamanho = 'medio',
  velho = false,
  className,
}: Props) {
  // Conta as trocas de valor para reiniciar o traço de mudança (estado derivado durante o render)
  const [anterior, setAnterior] = useState(valor)
  const [trocas, setTrocas] = useState(0)
  if (valor !== anterior) {
    setAnterior(valor)
    setTrocas((n) => n + 1)
  }

  return (
    <div className={cn('flex min-w-0 flex-col', className)} data-velho={velho || undefined}>
      {titulo ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <abbr
                className="rotulo w-fit cursor-help no-underline"
                title={titulo}
                // focável para mostrar o nome por extenso também pelo teclado
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
              >
                {rotulo}
              </abbr>
            }
          />
          <TooltipContent>{titulo}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="rotulo">{rotulo}</span>
      )}
      <span
        className={cn(
          'relative inline-flex w-fit max-w-full min-w-0 items-baseline gap-[0.15em]',
          CLASSE_DO_VALOR[tamanho],
        )}
      >
        <span className="valor truncate font-medium text-texto" title={valor}>
          {valor}
        </span>
        {unidade ? (
          <span className="shrink-0 text-[0.7em] leading-none text-apoio">{unidade}</span>
        ) : null}
        {trocas > 0 && !velho ? (
          <span
            key={trocas}
            aria-hidden="true"
            className="absolute right-0 -bottom-0.5 left-0 h-px bg-sinal opacity-0 motion-safe:animate-[sumir_400ms_var(--ease-out)_both] motion-reduce:hidden"
          />
        ) : null}
      </span>
    </div>
  )
}

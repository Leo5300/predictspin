import { cn } from '@/lib/utils'

type Tamanho = 'pequeno' | 'medio' | 'grande'

const CLASSE_DO_VALOR: Record<Tamanho, string> = {
  pequeno: 'text-15',
  medio: 'text-18',
  grande: 'text-24',
}

type Props = {
  /** Rótulo curto em caixa-alta (RMS, PICO, CURT, 1X...). */
  rotulo: string
  /** Valor já formatado em pt-BR. */
  valor: string
  /** Unidade, menor e em cinza, ao lado do valor. */
  unidade?: string
  tamanho?: Tamanho
  /** Dado velho: o valor fica no tom fraco e sem peso. */
  velho?: boolean
  className?: string
}

/**
 * Leitura: rótulo em cima, valor mono tabular embaixo e a unidade ao lado. O valor troca seco
 * quando chega dado novo; não há animação de número.
 */
export function Leitura({
  rotulo,
  valor,
  unidade,
  tamanho = 'medio',
  velho = false,
  className,
}: Props) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)} data-velho={velho || undefined}>
      <span className="rotulo">{rotulo}</span>
      <span className="flex min-w-0 items-baseline gap-1">
        <span
          className={cn('valor truncate font-medium text-texto', CLASSE_DO_VALOR[tamanho])}
          title={valor}
        >
          {valor}
        </span>
        {unidade ? <span className="shrink-0 text-12 text-apoio">{unidade}</span> : null}
      </span>
    </div>
  )
}

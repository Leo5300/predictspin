import { useId } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  /** Valores em ordem de tempo; nulo é lacuna (a linha é interrompida, não ligada por cima). */
  valores: readonly (number | null | undefined)[]
  /** Tracejado da linha (o estilo do ponto: A contínua, B tracejada, C pontilhada). */
  tracejado?: readonly number[]
  /** Variável CSS da cor da linha (um dos tons neutros de ponto). */
  cor?: string
  largura?: number
  altura?: number
  /** Dado velho: a linha fica no tom fraco. */
  velho?: boolean
  /** Descrição para leitor de tela (o desenho em si é decorativo ao lado do valor). */
  descricao: string
  className?: string
}

/**
 * Sparkline: tendência curta ao lado de uma leitura, sem eixos. Só é desenhada com dado real: com
 * menos de dois valores aparece um traço, nunca uma linha inventada.
 */
export function Sparkline({
  valores,
  tracejado = [],
  cor = '--ponto-a',
  largura = 96,
  altura = 24,
  velho = false,
  descricao,
  className,
}: Props) {
  const id = useId()
  const validos = valores.filter(
    (v): v is number => v !== null && v !== undefined && Number.isFinite(v),
  )
  if (validos.length < 2) {
    return (
      <span
        className={cn('inline-flex items-center text-12 text-fraco', className)}
        style={{ width: largura, height: altura }}
        data-vazio="true"
      >
        <span aria-hidden="true">—</span>
        <span className="sr-only">{descricao}: sem dados suficientes</span>
      </span>
    )
  }

  const minimo = Math.min(...validos)
  const maximo = Math.max(...validos)
  const faixa = maximo - minimo || Math.abs(maximo) || 1
  const margem = 2
  const passo = valores.length > 1 ? (largura - 2 * margem) / (valores.length - 1) : 0

  // um subcaminho por trecho contínuo: a lacuna quebra a linha
  const trechos: string[] = []
  let atual: string[] = []
  valores.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      if (atual.length > 0) trechos.push(atual.join(' '))
      atual = []
      return
    }
    const x = margem + i * passo
    const y = altura - margem - ((v - minimo) / faixa) * (altura - 2 * margem)
    atual.push(`${atual.length === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
  })
  if (atual.length > 0) trechos.push(atual.join(' '))

  return (
    <svg
      role="img"
      aria-labelledby={id}
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      className={cn('shrink-0 overflow-visible', className)}
      data-velho={velho || undefined}
    >
      <title id={id}>{descricao}</title>
      <path
        d={trechos.join(' ')}
        fill="none"
        stroke={velho ? 'var(--texto-fraco)' : `var(${cor})`}
        strokeWidth={1.25}
        strokeDasharray={tracejado.length > 0 ? tracejado.join(' ') : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

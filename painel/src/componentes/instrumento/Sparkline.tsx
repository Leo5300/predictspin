import { useId } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  /** Valores em ordem de tempo; nulo é lacuna (a linha é interrompida, não ligada por cima). */
  valores: readonly (number | null | undefined)[]
  largura?: number
  altura?: number
  /** Dado velho: a linha toda fica no tom fraco e o trecho atual perde a cor de sinal. */
  velho?: boolean
  /** Descrição para leitor de tela (o desenho em si acompanha um valor escrito ao lado). */
  descricao: string
  className?: string
}

/** Quantos últimos intervalos formam o "trecho atual", desenhado na cor de sinal. */
const TRECHO_ATUAL = 4

type Ponto = { x: number; y: number } | null

/**
 * Sparkline: tendência curta ao lado de uma leitura, sem eixos. Linha contínua em cinza neutro (a
 * letra do ponto já está no módulo; estilos de traço por ponto ficam para os gráficos que dividem o
 * eixo), último trecho e último ponto na cor de sinal. Só é desenhada com dado real: com menos de
 * dois valores, o espaço fica vazio.
 */
export function Sparkline({
  valores,
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
        {/* sem dado suficiente, o espaço fica vazio: o valor ao lado já mostra o traço */}
        <span className="sr-only">{descricao}: sem dados suficientes</span>
      </span>
    )
  }

  const minimo = Math.min(...validos)
  const maximo = Math.max(...validos)
  const faixa = maximo - minimo || Math.abs(maximo) || 1
  const margem = 3
  const passo = valores.length > 1 ? (largura - 2 * margem) / (valores.length - 1) : 0

  const pontos: Ponto[] = valores.map((v, i) =>
    v === null || v === undefined || !Number.isFinite(v)
      ? null
      : {
          x: margem + i * passo,
          y: altura - margem - ((v - minimo) / faixa) * (altura - 2 * margem),
        },
  )

  /** Caminho com um subcaminho por trecho contínuo: a lacuna quebra a linha. */
  const caminho = (de: number, ate: number) => {
    let d = ''
    let aberto = false
    for (let i = de; i <= ate; i++) {
      const p = pontos[i]
      if (!p) {
        aberto = false
        continue
      }
      d += `${aberto ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `
      aberto = true
    }
    return d.trim()
  }

  const ultimoIndice = pontos.findLastIndex((p) => p !== null)
  const ultimo = pontos[ultimoIndice]
  const inicioDoTrecho = Math.max(0, ultimoIndice - TRECHO_ATUAL)
  const corDoTrecho = velho ? 'var(--texto-fraco)' : 'var(--sinal)'

  return (
    <svg
      role="img"
      aria-labelledby={id}
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      className={cn('shrink-0 overflow-hidden', className)}
      data-velho={velho || undefined}
    >
      <title id={id}>{descricao}</title>
      {/* a cada valor novo o desenho entra pela direita (um passo) */}
      <g
        key={`${valores.length}-${String(validos.at(-1))}`}
        className="motion-safe:animate-[entrar-pela-direita_200ms_linear_both]"
        style={{ ['--deslocamento' as string]: `${passo.toFixed(1)}px` }}
      >
        <path
          d={caminho(0, inicioDoTrecho)}
          fill="none"
          stroke={velho ? 'var(--texto-fraco)' : 'var(--texto-apoio)'}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={caminho(inicioDoTrecho, ultimoIndice)}
          fill="none"
          stroke={corDoTrecho}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {ultimo ? <circle cx={ultimo.x} cy={ultimo.y} r={2.25} fill={corDoTrecho} /> : null}
      </g>
    </svg>
  )
}

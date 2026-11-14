import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import uPlot from 'uplot'

import type { Referencia } from '@/dominio/estado'
import { limitesDoEixo } from '@/dominio/escalas'
import {
  formatarDataHora,
  formatarHora,
  formatarHoraMinuto,
  formatarNumero,
  TRACO,
} from '@/dominio/formato'
import { cn } from '@/lib/utils'

import { useCoresDoCanvas, type CoresDoCanvas } from './cores'
import { desenharReticula, RETICULA_COLUNAS, RETICULA_LINHAS } from './desenhoDaReticula'

export type SerieDoGrafico = {
  /** Texto curto escrito no fim da linha (A, B, C, RMS, PICO, 1X...). */
  rotulo: string
  /** Um valor por instante; nulo interrompe a linha (lacuna). */
  valores: readonly (number | null)[]
  /** Tom neutro da linha: 0, 1 ou 2 (os três tons de ponto). */
  tom: 0 | 1 | 2
  /** Séries são sempre contínuas (linha interrompida = lacuna); distinguem-se por tom e espessura. */
  espessura?: number
  /** Dado ao vivo do período atual: traço na cor de sinal (só no gráfico AO VIVO). */
  aoVivo?: boolean
}

export type FaixaDoGrafico = { inicioS: number; fimS: number; rotulo: string }

type Props = {
  /** Instantes em segundos (época), crescentes. */
  temposS: readonly number[]
  series: readonly SerieDoGrafico[]
  altura: number
  /** Unidade do eixo vertical (g, rpm, vazio para curtose). */
  unidade: string
  casas: number
  /** Limites fixos do eixo do tempo; sem eles, o gráfico cobre os dados. */
  inicioS?: number
  fimS?: number
  /** Ensaios do período, como faixas rotuladas no topo. */
  faixas?: readonly FaixaDoGrafico[]
  /** Instantes de janelas saturadas. */
  saturadas?: readonly number[]
  /** Instantes de janelas rápidas (1 s): levam um traço curto na base da área. */
  rapidas?: readonly number[]
  /** Faixa normal (referência); sem ela nada é desenhado. */
  referencia?: Referencia | null
  /** Ao vivo: o eixo do tempo desliza de forma linear, terminando em "agora". */
  deslizarS?: number
  /** Mostra os rótulos do eixo do tempo (a faixa de rotação embaixo mostra; a de cima não). */
  mostrarTempo?: boolean
  /** Gráficos com a mesma chave movem o cursor juntos. */
  sincronia?: string
  descricao: string
  className?: string
}

type Extras = Pick<
  Props,
  'faixas' | 'saturadas' | 'rapidas' | 'referencia' | 'series' | 'unidade' | 'casas'
> & {
  /** Limites do eixo do tempo, em segundos; ao vivo, a janela que termina em "agora". */
  eixoX: () => [number, number]
}

const FONTE = '12px "IBM Plex Mono", monospace'
const MARGEM_DIREITA = 44

/**
 * Gráfico de tendência (uPlot) com retícula de osciloscópio 10 × 8 ao fundo. As linhas usam tons
 * neutros e estilos de traço diferentes, com o rótulo no fim de cada uma. Lacunas interrompem a
 * linha; ensaios aparecem como faixas rotuladas e janelas saturadas levam uma marca no topo.
 * Valores que chegam não animam: o gráfico só redesenha.
 */
export function GraficoTendencia({
  temposS,
  series,
  altura,
  unidade,
  casas,
  inicioS,
  fimS,
  faixas,
  saturadas,
  rapidas,
  referencia,
  deslizarS,
  mostrarTempo = true,
  sincronia,
  descricao,
  className,
}: Props) {
  const cores = useCoresDoCanvas()
  const caixaRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const eixoX = (): [number, number] => {
    if (deslizarS !== undefined) {
      const agora = Date.now() / 1000
      return [agora - deslizarS, agora]
    }
    const min = inicioS ?? temposS[0] ?? 0
    const max = fimS ?? temposS[temposS.length - 1] ?? min + 1
    return [min, max > min ? max : min + 1]
  }
  const extrasRef = useRef<Extras>({
    faixas,
    saturadas,
    rapidas,
    referencia,
    series,
    unidade,
    casas,
    eixoX,
  })
  const [largura, setLargura] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)

  useLayoutEffect(() => {
    extrasRef.current = { faixas, saturadas, rapidas, referencia, series, unidade, casas, eixoX }
  })

  useEffect(() => {
    const caixa = caixaRef.current
    if (!caixa) return
    const observador = new ResizeObserver(() => setLargura(Math.floor(caixa.clientWidth)))
    observador.observe(caixa)
    setLargura(Math.floor(caixa.clientWidth))
    return () => observador.disconnect()
  }, [])

  // A estrutura (quantas séries, traços, tema) recria o gráfico; os dados só são trocados.
  const estrutura = series
    .map((s) => `${s.rotulo}|${s.tom}|${s.espessura ?? ''}|${s.aoVivo ? 'v' : ''}`)
    .join(';')
  const pronto = largura > 0

  useEffect(() => {
    const caixa = caixaRef.current
    if (!caixa || !pronto) return
    const opcoes = montarOpcoes({
      largura: caixa.clientWidth,
      altura,
      cores,
      extras: extrasRef,
      mostrarTempo,
      sincronia,
      aoMoverCursor: setCursor,
    })
    const plot = new uPlot(opcoes, [[], ...extrasRef.current.series.map(() => [])], caixa)
    plotRef.current = plot
    return () => {
      plot.destroy()
      plotRef.current = null
    }
    // "estrutura" resume as séries: recriar a cada render seria caro e apagaria o cursor
  }, [estrutura, cores, altura, mostrarTempo, sincronia, pronto])

  useEffect(() => {
    plotRef.current?.setSize({ width: largura, height: altura })
  }, [largura, altura])

  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const dados: uPlot.AlignedData = [
      temposS as number[],
      ...series.map((s) => s.valores as (number | null)[]),
    ]
    // os limites do tempo vêm da função "range" da escala, que lê extrasRef (já atualizado)
    plot.setData(dados, true)
  }, [
    temposS,
    series,
    inicioS,
    fimS,
    deslizarS,
    estrutura,
    cores,
    pronto,
    faixas,
    saturadas,
    rapidas,
    referencia,
  ])

  // Ao vivo: o tempo desliza de forma linear. Com movimento reduzido, anda uma vez por segundo.
  useEffect(() => {
    if (deslizarS === undefined || !pronto) return
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let quadro = 0
    let temporizador: ReturnType<typeof setInterval> | undefined
    const mover = () => {
      const [min, max] = extrasRef.current.eixoX()
      plotRef.current?.setScale('x', { min, max })
    }
    if (reduzido) {
      mover()
      temporizador = setInterval(mover, 1000)
    } else {
      const laco = () => {
        mover()
        quadro = requestAnimationFrame(laco)
      }
      quadro = requestAnimationFrame(laco)
    }
    return () => {
      cancelAnimationFrame(quadro)
      clearInterval(temporizador)
    }
  }, [deslizarS, pronto, estrutura, cores])

  const instante = cursor === null ? undefined : temposS[cursor]
  const vazio = semValores(series)

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <div className="relative min-w-0">
        <div
          ref={caixaRef}
          role="img"
          aria-label={vazio ? `${descricao}: nenhum valor no período` : descricao}
          className="min-w-0 overflow-hidden"
          style={{ height: altura }}
        />
        {vazio ? (
          <p
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-13 text-apoio"
            aria-hidden="true"
          >
            Nenhum valor no período.
          </p>
        ) : null}
      </div>
      <div
        className="valor flex min-h-6 flex-wrap items-center gap-x-4 gap-y-0.5 px-2 text-12 text-apoio"
        aria-hidden="true"
      >
        {instante === undefined ? (
          series.map((s) => (
            <span key={s.rotulo} className="flex items-center gap-1.5">
              <Traco serie={s} cores={cores} />
              {s.rotulo}
            </span>
          ))
        ) : (
          <>
            <span className="text-texto">{formatarDataHora(instante * 1000)}</span>
            {series.map((s) => (
              <span key={s.rotulo} className="flex items-center gap-1.5">
                <Traco serie={s} cores={cores} />
                {s.rotulo}{' '}
                <span className="text-texto">
                  {cursor !== null && s.valores[cursor] !== null && s.valores[cursor] !== undefined
                    ? `${formatarNumero(s.valores[cursor], casas)}${unidade ? ` ${unidade}` : ''}`
                    : TRACO}
                </span>
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function Traco({ serie, cores }: { serie: SerieDoGrafico; cores: CoresDoCanvas }) {
  return (
    <svg width="22" height="6" aria-hidden="true" className="shrink-0">
      <line
        x1="0"
        y1="3"
        x2="22"
        y2="3"
        stroke={serie.aoVivo ? cores.sinal : cores.pontos[serie.tom]}
        strokeWidth={serie.espessura ?? 1.5}
      />
    </svg>
  )
}

type Montagem = {
  largura: number
  altura: number
  cores: CoresDoCanvas
  extras: { current: Extras }
  mostrarTempo: boolean
  sincronia: string | undefined
  aoMoverCursor: (indice: number | null) => void
}

function montarOpcoes({
  largura,
  altura,
  cores,
  extras,
  mostrarTempo,
  sincronia,
  aoMoverCursor,
}: Montagem): uPlot.Options {
  const divisoes = (min: number, max: number, partes: number) =>
    Array.from({ length: partes + 1 }, (_, i) => min + ((max - min) * i) / partes)

  return {
    width: largura,
    height: altura,
    // sem o eixo do tempo embaixo, a folga inferior evita que o rótulo do zero seja cortado
    padding: [8, MARGEM_DIREITA, mostrarTempo ? 0 : 8, 0],
    legend: { show: false },
    cursor: {
      y: false,
      points: { size: 5, width: 1, stroke: cores.texto, fill: cores.rebaixo },
      drag: { x: false, y: false },
      ...(sincronia ? { sync: { key: sincronia } } : {}),
    },
    scales: {
      x: { time: true, range: () => extras.current.eixoX() },
      y: {
        range: () => {
          const valores = extras.current.series.flatMap((s) => s.valores as (number | null)[])
          const referencia = extras.current.referencia
          if (referencia) valores.push(referencia.alarme)
          return limitesDoEixo(valores)
        },
      },
    },
    axes: [
      {
        show: mostrarTempo,
        stroke: cores.apoio,
        font: FONTE,
        size: 26,
        gap: 4,
        grid: { show: false },
        ticks: { show: true, stroke: cores.linhaForte, width: 1, size: 4 },
        // os rótulos caem sobre as divisões da retícula (uma a cada duas); em gráfico estreito,
        // menos rótulos, para as horas não se sobreporem (cada uma pede uns 96 px)
        splits: (u, _eixo, min, max) => {
          const larguraCss = u.over.clientWidth || largura
          const partes = [RETICULA_COLUNAS / 2, 2, 1].find((p) => larguraCss / p >= 96) ?? 1
          return divisoes(min, max, partes)
        },
        values: (_u, marcas) => {
          const comSegundos = (marcas.at(-1) ?? 0) - (marcas[0] ?? 0) <= 3600
          return marcas.map((s) =>
            comSegundos ? formatarHora(s * 1000) : formatarHoraMinuto(s * 1000),
          )
        },
      },
      {
        stroke: cores.apoio,
        font: FONTE,
        // largura pelo rótulo mais longo (fonte monoespaçada de 12 px: 7,2 px por caractere), para
        // "1.000,000" não ser cortado
        size: (_u, rotulos) => {
          // na primeira passada o uPlot ainda não tem os rótulos (chegam nulos, apesar da tipagem)
          const lista: readonly string[] = Array.isArray(rotulos) ? rotulos : []
          const maior = Math.max(5, ...lista.map((r) => r.length))
          return Math.ceil(maior * 7.2) + 14
        },
        gap: 4,
        grid: { show: false },
        ticks: { show: true, stroke: cores.linhaForte, width: 1, size: 4 },
        splits: (_u, _eixo, min, max) => divisoes(min, max, RETICULA_LINHAS / 2),
        // sem nenhum valor, a escala seria inventada: o eixo fica sem números
        values: (_u, marcas) =>
          semValores(extras.current.series)
            ? marcas.map(() => '')
            : marcas.map((v) => formatarNumero(v, extras.current.casas)),
      },
    ],
    series: [
      {},
      ...extras.current.series.map((s): uPlot.Series => ({
        label: s.rotulo,
        stroke: s.aoVivo ? cores.sinal : cores.pontos[s.tom],
        width: s.espessura ?? 1.5,
        spanGaps: false,
        points: {
          show: true,
          size: 3,
          fill: s.aoVivo ? cores.sinal : cores.pontos[s.tom],
          // só as amostras isoladas (sem vizinho) viram ponto: senão sumiriam entre duas lacunas
          filter: (u, indiceDaSerie) => {
            const valores = u.data[indiceDaSerie]
            if (!valores) return null
            const isolados: number[] = []
            for (let i = 0; i < valores.length; i++) {
              if (valores[i] == null) continue
              if (valores[i - 1] == null && valores[i + 1] == null) isolados.push(i)
            }
            return isolados
          },
        },
      })),
    ],
    hooks: {
      drawClear: [
        (u) => {
          const { left, top, width, height } = u.bbox
          u.ctx.save()
          u.ctx.fillStyle = cores.rebaixo
          u.ctx.fillRect(left, top, width, height)
          desenharReticula(u.ctx, left, top, width, height, {
            reticula: cores.reticula,
            fina: cores.reticulaFina,
          })
          desenharReferencia(u, extras.current.referencia, cores)
          u.ctx.restore()
        },
      ],
      draw: [
        (u) => {
          desenharFaixas(u, extras.current.faixas ?? [], cores)
          desenharSaturadas(u, extras.current.saturadas ?? [], cores)
          desenharRapidas(u, extras.current.rapidas ?? [], cores)
          desenharRotulosNoFim(u, extras.current.series, cores)
          u.ctx.save()
          u.ctx.strokeStyle = cores.linhaForte
          u.ctx.lineWidth = 1
          u.ctx.strokeRect(u.bbox.left + 0.5, u.bbox.top + 0.5, u.bbox.width - 1, u.bbox.height - 1)
          u.ctx.restore()
        },
      ],
      setCursor: [
        (u) => {
          aoMoverCursor(u.cursor.idx ?? null)
        },
      ],
    },
  }
}

/** Faixa normal: banda de tolerância e linhas dos limites. Só existe com referência. */
function desenharReferencia(
  u: uPlot,
  referencia: Referencia | null | undefined,
  cores: CoresDoCanvas,
) {
  if (!referencia) return
  const { left, width } = u.bbox
  const y = (v: number) => u.valToPos(v, 'y', true)
  const ctx = u.ctx
  ctx.fillStyle = cores.reticula
  const topo = y(referencia.centro + referencia.tolerancia)
  const base = y(referencia.centro - referencia.tolerancia)
  ctx.fillRect(left, topo, width, base - topo)
  const limite = (valor: number, cor: string) => {
    ctx.beginPath()
    ctx.strokeStyle = cor
    ctx.lineWidth = 1.5 * devicePixelRatio
    ctx.setLineDash([6 * devicePixelRatio, 4 * devicePixelRatio])
    const py = Math.round(y(valor)) + 0.5
    ctx.moveTo(left, py)
    ctx.lineTo(left + width, py)
    ctx.stroke()
    ctx.setLineDash([])
  }
  limite(referencia.atencao, cores.atencao)
  limite(referencia.alarme, cores.alarme)
}

/** Ensaios do período: faixa no topo da área, com o código. */
function desenharFaixas(u: uPlot, faixas: readonly FaixaDoGrafico[], cores: CoresDoCanvas) {
  if (faixas.length === 0) return
  const { left, top, width, height } = u.bbox
  const escala = devicePixelRatio
  const ctx = u.ctx
  ctx.save()
  ctx.beginPath()
  ctx.rect(left, top, width, height)
  ctx.clip()
  ctx.font = `${12 * escala}px "IBM Plex Mono", monospace`
  ctx.textBaseline = 'middle'
  const alturaDaFaixa = 16 * escala
  for (const faixa of faixas) {
    const x0 = Math.max(left, u.valToPos(faixa.inicioS, 'x', true))
    const x1 = Math.min(left + width, u.valToPos(faixa.fimS, 'x', true))
    if (x1 <= left || x0 >= left + width || x1 - x0 < 1) continue
    ctx.fillStyle = cores.modulo
    ctx.fillRect(x0, top, x1 - x0, alturaDaFaixa)
    ctx.strokeStyle = cores.linhaForte
    ctx.lineWidth = escala
    ctx.strokeRect(Math.round(x0) + 0.5, top + 0.5, Math.round(x1 - x0) - 1, alturaDaFaixa)
    // limites do ensaio até a base do gráfico
    ctx.beginPath()
    ctx.setLineDash([2 * escala, 3 * escala])
    ctx.moveTo(Math.round(x0) + 0.5, top + alturaDaFaixa)
    ctx.lineTo(Math.round(x0) + 0.5, top + height)
    ctx.moveTo(Math.round(x1) - 0.5, top + alturaDaFaixa)
    ctx.lineTo(Math.round(x1) - 0.5, top + height)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = cores.texto
    const espaco = x1 - x0 - 8 * escala
    if (espaco > 24 * escala) {
      let texto = faixa.rotulo
      while (texto.length > 3 && ctx.measureText(texto).width > espaco)
        texto = `${texto.slice(0, -2)}…`
      ctx.fillText(texto, x0 + 4 * escala, top + alturaDaFaixa / 2)
    }
  }
  ctx.restore()
}

/** Janela saturada: triângulo apontando para baixo, na borda de cima. */
/** Janela rápida (1 s): traço vertical curto na base da área, para distinguir das janelas de 5 s. */
function desenharRapidas(u: uPlot, rapidas: readonly number[], cores: CoresDoCanvas) {
  if (rapidas.length === 0) return
  const { left, top, width, height } = u.bbox
  const escala = devicePixelRatio
  const ctx = u.ctx
  ctx.save()
  ctx.strokeStyle = cores.texto
  ctx.lineWidth = 1.5 * escala
  ctx.beginPath()
  for (const t of rapidas) {
    const x = Math.round(u.valToPos(t, 'x', true)) + 0.5
    if (x < left || x > left + width) continue
    ctx.moveTo(x, top + height)
    ctx.lineTo(x, top + height - 7 * escala)
  }
  ctx.stroke()
  ctx.restore()
}

function desenharSaturadas(u: uPlot, saturadas: readonly number[], cores: CoresDoCanvas) {
  if (saturadas.length === 0) return
  const { left, top, width } = u.bbox
  const lado = 4 * devicePixelRatio
  const ctx = u.ctx
  ctx.save()
  ctx.fillStyle = cores.texto
  for (const s of saturadas) {
    const x = u.valToPos(s, 'x', true)
    if (x < left || x > left + width) continue
    ctx.beginPath()
    ctx.moveTo(x - lado, top)
    ctx.lineTo(x + lado, top)
    ctx.lineTo(x, top + lado * 1.6)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** O rótulo de cada série (A, B, C, RMS, PICO...) escrito no fim da linha. */
function desenharRotulosNoFim(u: uPlot, series: readonly SerieDoGrafico[], cores: CoresDoCanvas) {
  const { left, top, width, height } = u.bbox
  const escala = devicePixelRatio
  const ctx = u.ctx
  const tempos = u.data[0]
  ctx.save()
  ctx.font = `600 ${12 * escala}px "IBM Plex Mono", monospace`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = cores.texto
  const usados: number[] = []
  series.forEach((serie, k) => {
    const valores = u.data[k + 1]
    if (!valores) return
    for (let i = valores.length - 1; i >= 0; i--) {
      const v = valores[i]
      const t = tempos[i]
      if (v == null || t === undefined) continue
      const x = u.valToPos(t, 'x', true)
      if (x > left + width + 1) continue
      if (x < left) break
      let y = Math.min(
        top + height - 7 * escala,
        Math.max(top + 7 * escala, u.valToPos(v, 'y', true)),
      )
      // afasta rótulos que cairiam um sobre o outro
      for (const outro of usados) {
        if (Math.abs(outro - y) < 13 * escala) y = outro + 13 * escala
      }
      usados.push(y)
      ctx.fillText(serie.rotulo, Math.min(x, left + width) + 5 * escala, y)
      break
    }
  })
  ctx.restore()
}

/** Nenhuma série tem um valor finito: não há o que desenhar nem escala honesta para mostrar. */
function semValores(series: readonly SerieDoGrafico[]): boolean {
  return series.every((s) => s.valores.every((v) => v === null || !Number.isFinite(v)))
}

import { grafemas } from '@/dominio/texto'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Referencia } from '@/dominio/estado'
import { corDaCelula, escalaDaLinha, type EscalaLinha } from '@/dominio/escalas'
import {
  formatarG,
  formatarHora,
  formatarHoraMinuto,
  formatarIntervalo,
  formatarRpm,
  TRACO,
} from '@/dominio/formato'
import { cn } from '@/lib/utils'

import { cinzaDoNivel, DEGRAUS_DA_RAMPA, useCoresDoCanvas, type CoresDoCanvas } from './cores'
import { SeloSim } from './SeloSim'
import { Unidade } from './Unidade'

export type IntervaloDoMapa = {
  inicio: string
  fim: string
  /** Janelas recebidas no intervalo; 0 = lacuna. */
  janelas: number
  saturou: boolean
  rotacaoRpm: number | null
}

export type LinhaDoMapa = {
  /** Identificador estável (ex.: "A-rms"). */
  chave: string
  ponto: string
  /** RMS, 1X, 2X ou 3X. */
  grandeza: string
  /** Um valor por intervalo; nulo onde não há dado. */
  valores: readonly (number | null)[]
  /** Referência do ponto para esta grandeza; sem ela a linha é só cinza. */
  referencia?: Referencia | null
}

type Props = {
  intervalos: readonly IntervaloDoMapa[]
  linhas: readonly LinhaDoMapa[]
  simulado?: boolean
  className?: string
}

const ALTURA_DA_LINHA = 18
const ALTURA_DA_MARCA = 8
const ESPACO_ENTRE_PONTOS = 5

/**
 * Mapa de ordens: o tempo corre na horizontal e cada linha é uma grandeza de um ponto (A·RMS,
 * A·1X, A·2X, A·3X, depois B e C). Cada célula é um intervalo de tempo.
 *
 * Sem referência, a célula é um tom de cinza proporcional à amplitude, com a escala de cada linha
 * indo do mínimo ao máximo da própria linha no período. Com referência, o que passa do limite de
 * atenção fica âmbar e o que passa do de alarme, vermelho. Lacuna fica vazia, período com
 * saturação leva marca no topo e fonte simulada leva hachura.
 */
export function MapaOrdens({ intervalos, linhas, simulado = false, className }: Props) {
  const cores = useCoresDoCanvas()
  const areaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [largura, setLargura] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [linhaSobCursor, setLinhaSobCursor] = useState<number | null>(null)
  const ultimoInicio = useRef<string | null>(null)

  const escalas = useMemo(() => linhas.map((l) => escalaDaLinha(l.valores)), [linhas])
  const temReferencia = linhas.some((l) => l.referencia)
  const total = intervalos.length

  // posição vertical de cada linha, com um espaço entre os pontos
  const posicoes = useMemo(() => {
    const ys: number[] = []
    let y = ALTURA_DA_MARCA
    linhas.forEach((linha, i) => {
      if (i > 0 && linhas[i - 1]?.ponto !== linha.ponto) y += ESPACO_ENTRE_PONTOS
      ys.push(y)
      y += ALTURA_DA_LINHA
    })
    return { ys, altura: y }
  }, [linhas])

  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const observador = new ResizeObserver(() => setLargura(Math.floor(area.clientWidth)))
    observador.observe(area)
    setLargura(Math.floor(area.clientWidth))
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || largura <= 0) return
    const escala = window.devicePixelRatio || 1
    canvas.width = Math.round(largura * escala)
    canvas.height = Math.round(posicoes.altura * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    desenhar(ctx, {
      largura,
      altura: posicoes.altura,
      ys: posicoes.ys,
      intervalos,
      linhas,
      escalas,
      simulado,
      cores,
    })
  }, [largura, posicoes, intervalos, linhas, escalas, simulado, cores])

  // A coluna nova entra pela direita: o desenho desliza uma célula em 200 ms (só transform)
  const inicioDaUltima = intervalos.at(-1)?.inicio ?? null
  useEffect(() => {
    const canvas = canvasRef.current
    const anterior = ultimoInicio.current
    ultimoInicio.current = inicioDaUltima
    if (!canvas || anterior === null || inicioDaUltima === null || anterior === inicioDaUltima)
      return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const celula = largura / Math.max(1, intervalos.length)
    canvas.animate([{ transform: `translateX(${celula}px)` }, { transform: 'translateX(0)' }], {
      duration: 200,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    })
  }, [inicioDaUltima, largura, intervalos.length])

  const linhaEm = (clientY: number): number | null => {
    const area = areaRef.current
    if (!area) return null
    const y = clientY - area.getBoundingClientRect().top
    const indice = posicoes.ys.findIndex((topo) => y >= topo && y < topo + ALTURA_DA_LINHA)
    return indice >= 0 ? indice : null
  }

  const indiceEm = (clientX: number): number | null => {
    const area = areaRef.current
    if (!area || total === 0) return null
    const caixa = area.getBoundingClientRect()
    const fracao = (clientX - caixa.left) / caixa.width
    if (fracao < 0 || fracao > 1) return null
    return Math.min(total - 1, Math.floor(fracao * total))
  }

  const intervalo = cursor === null ? undefined : intervalos[cursor]
  const primeiro = intervalos[0]
  const ultimo = intervalos[total - 1]
  const meio = intervalos[Math.floor(total / 2)]
  const passoS = primeiro ? (Date.parse(primeiro.fim) - Date.parse(primeiro.inicio)) / 1000 : 0

  // Com dado em menos de 25 % do período, o mapa ainda está "aquecendo"
  const primeiroComDado = intervalos.findIndex((i) => i.janelas > 0)
  const aquecimento =
    primeiroComDado > 0 && (total - primeiroComDado) / total < 0.25
      ? {
          minutos: Math.max(1, Math.round(((total - primeiroComDado) * passoS) / 60)),
          total: Math.round((total * passoS) / 60),
        }
      : null

  return (
    <div
      className={cn('flex min-w-0 flex-col gap-2', className)}
      data-simulado={simulado || undefined}
    >
      <div
        className="grid min-w-0 gap-x-2"
        style={{
          gridTemplateColumns: `max(3.25rem, ${larguraDosRotulos(linhas)}ch) minmax(0, 1fr) 4.5rem`,
        }}
      >
        {/* rótulos das linhas */}
        <div className="relative" style={{ height: posicoes.altura }} aria-hidden="true">
          {linhas.map((linha, i) => (
            <span
              key={linha.chave}
              className="valor absolute right-0 flex items-center text-12 whitespace-nowrap text-apoio"
              style={{ top: posicoes.ys[i], height: ALTURA_DA_LINHA }}
            >
              <span className="font-semibold text-texto">{linha.ponto}</span>·{linha.grandeza}
            </span>
          ))}
        </div>

        {/* células */}
        <div
          ref={areaRef}
          role="slider"
          tabIndex={0}
          aria-label={`Mapa de ordens: ${linhas.length} linhas por ${total} intervalos de ${formatarIntervalo(passoS)}. Use as setas para percorrer os intervalos.`}
          aria-orientation="horizontal"
          aria-valuemin={1}
          aria-valuemax={Math.max(1, total)}
          aria-valuenow={(cursor ?? 0) + 1}
          aria-valuetext={
            intervalo
              ? `${formatarHora(intervalo.inicio)} a ${formatarHora(intervalo.fim)}`
              : 'nenhum intervalo escolhido'
          }
          className="relative min-w-0 cursor-crosshair overflow-hidden border border-linha-forte bg-modulo"
          style={{ height: posicoes.altura + 2 }}
          onPointerMove={(evento) => {
            setCursor(indiceEm(evento.clientX))
            setLinhaSobCursor(linhaEm(evento.clientY))
          }}
          onPointerDown={(evento) => {
            setCursor(indiceEm(evento.clientX))
            setLinhaSobCursor(linhaEm(evento.clientY))
          }}
          onPointerLeave={(evento) => {
            if (evento.pointerType === 'mouse') {
              setCursor(null)
              setLinhaSobCursor(null)
            }
          }}
          onKeyDown={(evento) => {
            if (total === 0) return
            if (evento.key === 'ArrowRight') setCursor((c) => Math.min(total - 1, (c ?? -1) + 1))
            else if (evento.key === 'ArrowLeft') setCursor((c) => Math.max(0, (c ?? total) - 1))
            else if (evento.key === 'Home') setCursor(0)
            else if (evento.key === 'End') setCursor(total - 1)
            else if (evento.key === 'Escape') setCursor(null)
            else return
            evento.preventDefault()
          }}
        >
          <canvas ref={canvasRef} className="block w-full" style={{ height: posicoes.altura }} />
          {cursor !== null && total > 0 ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 border-x border-sinal/50"
              style={{ left: `${(cursor / total) * 100}%`, width: `max(${100 / total}%, 3px)` }}
            />
          ) : null}
          {cursor !== null && linhaSobCursor !== null && total > 0 ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute border-2 border-sinal"
              style={{
                left: `calc(${(cursor / total) * 100}% - 1px)`,
                width: `calc(max(${100 / total}%, 3px) + 2px)`,
                top: (posicoes.ys[linhaSobCursor] ?? 0) - 1,
                height: ALTURA_DA_LINHA + 1,
              }}
            />
          ) : null}
          {aquecimento ? (
            <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 border border-linha-forte bg-modulo px-1.5 py-0.5 text-12 text-texto">
              aquecendo:{' '}
              <span className="valor">
                {aquecimento.minutos} min de {aquecimento.total}
              </span>
            </span>
          ) : null}
        </div>

        {/* máximo de cada linha: é o fim da escala de cinza dela */}
        <div className="relative" style={{ height: posicoes.altura }}>
          <span className="rotulo absolute -top-0.5 left-0 hidden">máx</span>
          {linhas.map((linha, i) => (
            <span
              key={linha.chave}
              className="valor absolute left-0 flex items-center text-12 whitespace-nowrap text-apoio"
              style={{ top: posicoes.ys[i], height: ALTURA_DA_LINHA }}
              title={`Máximo de ${linha.ponto}·${linha.grandeza} no período`}
            >
              {escalas[i] && escalas[i].maximo > 0 ? formatarG(escalas[i].maximo) : TRACO}
            </span>
          ))}
        </div>

        {/* eixo do tempo */}
        <div />
        <div className="valor flex justify-between pt-1 text-12 text-apoio">
          <span>{primeiro ? formatarHoraMinuto(primeiro.inicio) : TRACO}</span>
          <span>{meio ? formatarHoraMinuto(meio.inicio) : ''}</span>
          <span>{ultimo ? formatarHoraMinuto(ultimo.fim) : TRACO}</span>
        </div>
        <span className="rotulo pt-1">
          máx <Unidade>g</Unidade>
        </span>
      </div>

      {/* leitura do intervalo sob o cursor */}
      <div
        aria-live="polite"
        className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border border-linha bg-rebaixo px-2 py-1 text-12"
      >
        {intervalo ? (
          <LeituraDoIntervalo intervalo={intervalo} indice={cursor ?? 0} linhas={linhas} />
        ) : (
          <span className="text-apoio">
            Passe o cursor ou use as setas sobre o mapa para ler um intervalo.
          </span>
        )}
      </div>

      <Legenda temReferencia={temReferencia} simulado={simulado} passoS={passoS} cores={cores} />
    </div>
  )
}

function LeituraDoIntervalo({
  intervalo,
  indice,
  linhas,
}: {
  intervalo: IntervaloDoMapa
  indice: number
  linhas: readonly LinhaDoMapa[]
}) {
  const pontos = [...new Set(linhas.map((l) => l.ponto))]
  return (
    <>
      <span className="valor font-medium whitespace-nowrap text-texto">
        {formatarHora(intervalo.inicio)}–{formatarHora(intervalo.fim)}
      </span>
      {intervalo.janelas === 0 ? (
        <span className="text-texto">lacuna: nenhuma janela neste intervalo</span>
      ) : (
        <>
          <span className="whitespace-nowrap text-apoio">
            <span className="valor text-texto">{intervalo.janelas}</span>{' '}
            {intervalo.janelas === 1 ? 'janela' : 'janelas'} ·{' '}
            <span className="valor text-texto">{formatarRpm(intervalo.rotacaoRpm)}</span> rpm
            {intervalo.saturou ? <span className="font-medium text-texto"> · saturou</span> : null}
          </span>
          {pontos.map((ponto) => (
            <span key={ponto} className="valor whitespace-nowrap text-apoio">
              <span className="font-semibold text-texto">{ponto}</span>{' '}
              {linhas
                .filter((l) => l.ponto === ponto)
                .map((l) => `${l.grandeza} ${formatarG(l.valores[indice])}`)
                .join(' · ')}{' '}
              g
            </span>
          ))}
        </>
      )}
    </>
  )
}

function Legenda({
  temReferencia,
  simulado,
  passoS,
  cores,
}: {
  temReferencia: boolean
  simulado: boolean
  passoS: number
  cores: CoresDoCanvas
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-apoio">
      <span className="flex items-center gap-1.5">
        <span className="flex border border-linha-forte" aria-hidden="true">
          {Array.from({ length: DEGRAUS_DA_RAMPA }, (_, i) => i / DEGRAUS_DA_RAMPA).map((nivel) => (
            <span
              key={nivel}
              className="size-3"
              style={{ backgroundColor: cinzaDoNivel(nivel, cores) }}
            />
          ))}
        </span>
        cinza em {DEGRAUS_DA_RAMPA} degraus: do mínimo ao máximo da linha no período
      </span>
      {temReferencia ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="size-3 border border-atencao-sobre bg-atencao" aria-hidden="true" />
            acima do limite de atenção
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 bg-alarme" aria-hidden="true" />
            acima do limite de alarme
          </span>
        </>
      ) : (
        <span>sem referência aprendida: cor de desvio indisponível</span>
      )}
      <span className="flex items-center gap-1.5">
        <span
          className="size-3 border border-dashed border-linha-forte bg-modulo"
          aria-hidden="true"
        />
        lacuna
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="size-3 border border-linha-forte bg-modulo bg-[radial-gradient(var(--linha)_1px,transparent_1px)] bg-size-[4px_4px]"
          aria-hidden="true"
        />
        sem dado (antes da primeira janela)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1 w-3 bg-texto" aria-hidden="true" />
        saturação
      </span>
      {simulado ? (
        <span className="flex items-center gap-1.5">
          <SeloSim /> hachura: dado simulado
        </span>
      ) : null}
      <span className="ml-auto whitespace-nowrap">1 célula = {formatarIntervalo(passoS)}</span>
    </div>
  )
}

type Desenho = {
  largura: number
  altura: number
  ys: number[]
  intervalos: readonly IntervaloDoMapa[]
  linhas: readonly LinhaDoMapa[]
  escalas: EscalaLinha[]
  simulado: boolean
  cores: CoresDoCanvas
}

function desenhar(ctx: CanvasRenderingContext2D, d: Desenho) {
  const total = d.intervalos.length
  ctx.clearRect(0, 0, d.largura, d.altura)
  if (total === 0) return
  const passo = d.largura / total

  // antes do primeiro dado do período: padrão discreto de pontos ("sem dado")
  const primeiroComDado = d.intervalos.findIndex((i) => i.janelas > 0)
  const fimSemDado = primeiroComDado === -1 ? d.largura : Math.floor(primeiroComDado * passo)
  if (fimSemDado > 0) {
    ctx.fillStyle = d.cores.linha
    for (let x = 4; x < fimSemDado; x += 8) {
      for (let y = 4; y < d.altura; y += 8) ctx.fillRect(x, y, 1, 1)
    }
  }

  d.linhas.forEach((linha, i) => {
    const y = d.ys[i]
    const escala = d.escalas[i]
    if (y === undefined || !escala) return
    for (let k = 0; k < total; k++) {
      const cor = corDaCelula(linha.valores[k], escala, linha.referencia)
      if (cor.tipo === 'lacuna') continue
      ctx.fillStyle =
        cor.tipo === 'alarme'
          ? d.cores.alarme
          : cor.tipo === 'atencao'
            ? d.cores.atencao
            : cinzaDoNivel(cor.nivel, d.cores)
      const x0 = Math.floor(k * passo)
      const x1 = Math.floor((k + 1) * passo)
      ctx.fillRect(x0, y, Math.max(1, x1 - x0), ALTURA_DA_LINHA - 1)
    }
  })

  // lacuna (intervalo sem janela depois da primeira): contorno tracejado, como na legenda, para não
  // se confundir com "sem dado" (pontos) nem com o fundo
  if (primeiroComDado !== -1) {
    ctx.save()
    ctx.strokeStyle = d.cores.linhaForte
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    let k = primeiroComDado
    while (k < total) {
      if ((d.intervalos[k]?.janelas ?? 0) > 0) {
        k++
        continue
      }
      const inicio = k
      while (k < total && (d.intervalos[k]?.janelas ?? 0) === 0) k++
      const x0 = Math.floor(inicio * passo) + 0.5
      const x1 = Math.floor(k * passo) - 0.5
      for (const y of d.ys) ctx.strokeRect(x0, y + 0.5, Math.max(1, x1 - x0), ALTURA_DA_LINHA - 2)
    }
    ctx.restore()
  }

  // marca de saturação no topo do intervalo
  ctx.fillStyle = d.cores.texto
  d.intervalos.forEach((intervalo, k) => {
    if (!intervalo.saturou) return
    const x0 = Math.floor(k * passo)
    ctx.fillRect(x0, 1, Math.max(2, Math.floor((k + 1) * passo) - x0), ALTURA_DA_MARCA - 4)
  })

  if (d.simulado) {
    // hachura diagonal sobre os intervalos que têm dado (a lacuna fica limpa)
    ctx.save()
    ctx.beginPath()
    d.intervalos.forEach((intervalo, k) => {
      if (intervalo.janelas === 0) return
      const x0 = Math.floor(k * passo)
      ctx.rect(x0, 0, Math.max(1, Math.floor((k + 1) * passo) - x0), d.altura)
    })
    ctx.clip()
    ctx.strokeStyle = d.cores.simulado
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = -d.altura; x < d.largura; x += 8) {
      ctx.moveTo(x, d.altura)
      ctx.lineTo(x + d.altura, 0)
    }
    ctx.stroke()
    ctx.restore()
  }
}

/** Largura da coluna de rótulos, em caracteres da fonte monoespaçada: "MANCAL-T2·RMS" cabe inteiro. */
function larguraDosRotulos(linhas: readonly { ponto: string; grandeza: string }[]): number {
  return (
    Math.max(0, ...linhas.map((l) => grafemas(l.ponto).length + 1 + grafemas(l.grandeza).length)) +
    0.5
  )
}

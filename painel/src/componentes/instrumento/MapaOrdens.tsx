import { useEffect, useMemo, useRef, useState } from 'react'

import type { Referencia } from '@/dominio/estado'
import {
  formatarG,
  formatarHora,
  formatarHoraMinuto,
  formatarIntervalo,
  formatarRpm,
  TRACO,
} from '@/dominio/formato'
import {
  classificarLinha,
  destaquesDoMapa,
  FAIXA_MORTA,
  intervalosCompletos,
  marchaDoIntervalo,
  textoDoDestaque,
  TEXTO_NORMAL,
  tipicosPorMarcha,
  trocasDeMarcha,
  type ClasseDaCelula,
} from '@/dominio/mapaTipico'
import { grafemas } from '@/dominio/texto'
import { cn } from '@/lib/utils'

import { pontoAbaixo, tomDaCelula, useCoresDoCanvas, type CoresDoCanvas } from './cores'
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
  /** Referência do ponto para esta grandeza; só com ela aparecem âmbar e vermelho. */
  referencia?: Referencia | null
}

/** Ensaio do período, como faixa acima das linhas (código e etapa). */
export type EnsaioDoMapa = { inicio: string; fim: string | null; codigo: string; etapa: string }
/** Evento marcado num ensaio, como marca na faixa dos ensaios. */
export type EventoDoMapa = { instante: string; motivo: string }

type Props = {
  intervalos: readonly IntervaloDoMapa[]
  linhas: readonly LinhaDoMapa[]
  /** Rotações nominais da máquina: definem a marcha de cada intervalo. */
  nominais?: readonly number[]
  ensaios?: readonly EnsaioDoMapa[]
  eventos?: readonly EventoDoMapa[]
  simulado?: boolean
  /** Dado velho: hora da última janela; a leitura em texto diz que vale até ela. */
  ultimaJanelaVelha?: string | null
  className?: string
}

const ALTURA_DA_LINHA = 18
const ALTURA_DA_MARCA = 8
const ESPACO_ENTRE_PONTOS = 5

const ROTULO_MOTIVO: Record<string, string> = {
  pancada: 'pancada',
  cavaco: 'cavaco',
  maquina_vizinha: 'máquina vizinha',
  outro: 'outro',
}

/**
 * Mapa de ordens: o tempo corre na horizontal e cada linha é uma medida de um ponto (A·RMS, A·1X,
 * A·2X, A·3X, depois B e C). Cada célula é um intervalo de tempo, comparado com o TÍPICO da própria
 * linha (mediana do período na mesma marcha): tom igual = dentro de ±15 %; mais contraste = acima;
 * pontilhado = abaixo; tracejado = lacuna. Acima das linhas, a marcha ao longo do tempo e os ensaios
 * do período; abaixo, a leitura em texto do que fugiu do típico. Sem referência aprendida não há
 * âmbar nem vermelho. Dado simulado: hachura na moldura e selo SIM, nunca sobre as células.
 */
export function MapaOrdens({
  intervalos,
  linhas,
  nominais = [],
  ensaios = [],
  eventos = [],
  simulado = false,
  ultimaJanelaVelha = null,
  className,
}: Props) {
  const cores = useCoresDoCanvas()
  const areaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [largura, setLargura] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [linhaSobCursor, setLinhaSobCursor] = useState<number | null>(null)
  const ultimoInicio = useRef<string | null>(null)
  const total = intervalos.length

  const marchas = useMemo(
    () => intervalos.map((i) => (i.janelas > 0 ? marchaDoIntervalo(i.rotacaoRpm, nominais) : null)),
    [intervalos, nominais],
  )
  const janelasPorIntervalo = useMemo(() => intervalos.map((i) => i.janelas), [intervalos])
  const classes = useMemo(
    () => linhas.map((l) => classificarLinha(l.valores, marchas, janelasPorIntervalo)),
    [linhas, marchas, janelasPorIntervalo],
  )
  /** Típico de cada linha na marcha do último intervalo com dado (coluna da direita). */
  const tipicosAtuais = useMemo(() => {
    const completos = intervalosCompletos(janelasPorIntervalo, intervalos.length)
    const ultimaMarcha = marchas.findLast((m) => m !== null) ?? null
    return linhas.map((l) => {
      const grupo = tipicosPorMarcha(l.valores, marchas, completos).get(
        ultimaMarcha === null ? 'sem' : String(ultimaMarcha),
      )
      return grupo?.tipico ?? null
    })
  }, [linhas, marchas, janelasPorIntervalo, intervalos.length])
  const destaques = useMemo(
    () =>
      destaquesDoMapa(
        linhas.map((l, i) => ({ ponto: l.ponto, grandeza: l.grandeza, classes: classes[i] ?? [] })),
      ),
    [linhas, classes],
  )

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
      classes,
      cores,
    })
  }, [largura, posicoes, intervalos, linhas, classes, cores])

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
  const inicioMs = primeiro ? Date.parse(primeiro.inicio) : 0
  const fimMs = ultimo ? Date.parse(ultimo.fim) : 0
  const posicaoNoTempo = (instante: string) =>
    fimMs > inicioMs
      ? Math.min(1, Math.max(0, (Date.parse(instante) - inicioMs) / (fimMs - inicioMs)))
      : 0

  // Com dado em menos de 25 % do período, o mapa ainda está "aquecendo"
  const primeiroComDado = intervalos.findIndex((i) => i.janelas > 0)
  const aquecimento =
    primeiroComDado > 0 && (total - primeiroComDado) / total < 0.25
      ? {
          minutos: Math.max(1, Math.round(((total - primeiroComDado) * passoS) / 60)),
          total: Math.round((total * passoS) / 60),
        }
      : null

  const trocas = trocasDeMarcha(marchas)
  const ensaiosNoPeriodo = ensaios.filter(
    (e) => Date.parse(e.inicio) < fimMs && (e.fim === null || Date.parse(e.fim) > inicioMs),
  )
  const eventosNoPeriodo = eventos.filter((e) => {
    const t = Date.parse(e.instante)
    return t >= inicioMs && t <= fimMs
  })
  const temFaixaDeEnsaios = ensaiosNoPeriodo.length > 0 || eventosNoPeriodo.length > 0
  const colunas = `max(3.25rem, ${larguraDosRotulos(linhas)}ch) minmax(0, 1fr) 4.5rem`
  // a moldura hachurada (simulado) e a borda empurram as células: os rótulos acompanham
  const deslocamento = simulado ? 5 : 1

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {/* contexto: a marcha ao longo do tempo e os ensaios do período */}
      <div className="grid min-w-0 gap-x-2 gap-y-px" style={{ gridTemplateColumns: colunas }}>
        <span className="rotulo self-center text-right">marcha</span>
        <div
          className="relative h-5 min-w-0 overflow-hidden border border-linha bg-rebaixo"
          data-testid="faixa-de-marcha"
        >
          {trocas.map((troca, i) => {
            const proxima = trocas[i + 1]?.indice ?? total
            // segmento estreito (o intervalo da troca, com a média de duas marchas, ou pouco tempo
            // numa marcha): só a marca; o número fica na dica, nunca cortado
            const texto = troca.marcha === 0 ? 'parada' : formatarRpm(troca.marcha)
            const larguraPx = ((proxima - troca.indice) / Math.max(1, total)) * largura
            const curto = larguraPx < texto.length * 7.5 + 10
            return (
              <span
                key={`${troca.indice}-${troca.marcha}`}
                title={troca.marcha === 0 ? 'parada' : `marcha ${troca.marcha} rpm`}
                className={cn(
                  'valor absolute inset-y-0 flex items-center truncate px-1 text-12 text-texto',
                  i > 0 && 'border-l-2 border-texto',
                )}
                style={{
                  left: `${(troca.indice / Math.max(1, total)) * 100}%`,
                  width: `${((proxima - troca.indice) / Math.max(1, total)) * 100}%`,
                }}
              >
                {curto ? null : texto}
              </span>
            )
          })}
        </div>
        <span className="rotulo self-center">rpm</span>

        {temFaixaDeEnsaios ? (
          <>
            <span className="rotulo self-center text-right">ensaio</span>
            <div
              className="relative h-5 min-w-0 overflow-hidden border border-linha bg-modulo"
              data-testid="faixa-de-ensaios"
            >
              {ensaiosNoPeriodo.map((e) => {
                const x0 = posicaoNoTempo(e.inicio)
                const x1 = e.fim === null ? 1 : posicaoNoTempo(e.fim)
                // ensaio curto: só a faixa (código e etapa na dica); o texto nunca sai cortado
                const texto = `${e.etapa} · ${e.codigo}`
                const cabe = (x1 - x0) * largura >= texto.length * 7.5 + 10
                return (
                  <span
                    key={e.codigo}
                    title={texto}
                    className="valor absolute inset-y-0 flex items-center overflow-hidden border-x border-linha-forte bg-realce px-1 text-12 whitespace-nowrap text-texto"
                    style={{
                      left: `${x0 * 100}%`,
                      width: `max(${(x1 - x0) * 100}%, 3px)`,
                    }}
                  >
                    {cabe ? texto : null}
                  </span>
                )
              })}
              {eventosNoPeriodo.map((e) => (
                <span
                  key={`${e.instante}-${e.motivo}`}
                  title={`evento marcado: ${ROTULO_MOTIVO[e.motivo] ?? e.motivo} às ${formatarHora(e.instante)}`}
                  className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-texto"
                  style={{ left: `${posicaoNoTempo(e.instante) * 100}%` }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -left-1 text-12 leading-none"
                  >
                    ▾
                  </span>
                </span>
              ))}
            </div>
            <span />
          </>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-x-2" style={{ gridTemplateColumns: colunas }}>
        {/* rótulos das linhas */}
        <div
          className="relative"
          style={{ height: posicoes.altura + 2 * deslocamento }}
          aria-hidden="true"
        >
          {linhas.map((linha, i) => (
            <span
              key={linha.chave}
              className="valor absolute right-0 flex items-center text-12 whitespace-nowrap text-apoio"
              style={{ top: (posicoes.ys[i] ?? 0) + deslocamento, height: ALTURA_DA_LINHA }}
            >
              <span className="font-semibold text-texto">{linha.ponto}</span>·{linha.grandeza}
            </span>
          ))}
        </div>

        {/* moldura: com dado simulado, a hachura fica nela (e no selo SIM), nunca sobre as células */}
        <div
          className={cn('min-w-0', simulado && 'hachura border border-linha-forte p-[3px]')}
          data-simulado={simulado || undefined}
        >
          <div
            ref={areaRef}
            role="slider"
            tabIndex={0}
            aria-label={`Mapa de ordens: ${linhas.length} linhas por ${total} intervalos de ${formatarIntervalo(passoS)}. Setas para os lados percorrem os intervalos; para cima e para baixo, as linhas.`}
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
              const n = linhas.length
              if (evento.key === 'ArrowRight') setCursor((c) => Math.min(total - 1, (c ?? -1) + 1))
              else if (evento.key === 'ArrowLeft') setCursor((c) => Math.max(0, (c ?? total) - 1))
              else if (evento.key === 'ArrowDown') {
                setCursor((c) => c ?? total - 1)
                setLinhaSobCursor((l) => Math.min(n - 1, (l ?? -1) + 1))
              } else if (evento.key === 'ArrowUp') {
                setCursor((c) => c ?? total - 1)
                setLinhaSobCursor((l) => Math.max(0, (l ?? 1) - 1))
              } else if (evento.key === 'Home') setCursor(0)
              else if (evento.key === 'End') setCursor(total - 1)
              else if (evento.key === 'Escape') {
                setCursor(null)
                setLinhaSobCursor(null)
              } else return
              if (evento.key === 'ArrowLeft' || evento.key === 'ArrowRight')
                setLinhaSobCursor((l) => l ?? 0)
              evento.preventDefault()
            }}
          >
            <canvas ref={canvasRef} className="block w-full" style={{ height: posicoes.altura }} />
            {/* trocas de marcha também marcadas sobre as linhas, como na faixa de cima */}
            {trocas.slice(1).map((troca) => (
              <span
                key={`troca-${troca.indice}`}
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-linha-forte"
                style={{ left: `${(troca.indice / total) * 100}%` }}
              />
            ))}
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
        </div>

        {/* típico de cada linha (marcha atual): é o "zero" da comparação */}
        <div className="relative" style={{ height: posicoes.altura }}>
          {linhas.map((linha, i) => (
            <span
              key={linha.chave}
              className="valor absolute left-0 flex items-center text-12 whitespace-nowrap text-apoio"
              style={{ top: (posicoes.ys[i] ?? 0) + deslocamento, height: ALTURA_DA_LINHA }}
              title={`Típico de ${linha.ponto}·${linha.grandeza} na marcha atual (mediana do período)`}
            >
              {tipicosAtuais[i] === null ? TRACO : formatarG(tipicosAtuais[i])}
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
          típico <Unidade>g</Unidade>
        </span>
      </div>

      {/* leitura em texto: calculada pela regra do típico, sem inventar causa */}
      <div
        role="status"
        className="flex flex-col gap-0.5 border border-linha bg-modulo px-2 py-1.5 text-13"
        data-testid="leitura-do-mapa"
      >
        {ultimaJanelaVelha ? (
          <span className="text-apoio">
            Sem janela nova desde{' '}
            <span className="valor">{formatarHoraMinuto(ultimaJanelaVelha)}</span>: a leitura abaixo
            vale até lá.
          </span>
        ) : null}
        {destaques.length === 0 ? (
          <span className="text-texto">{TEXTO_NORMAL}</span>
        ) : (
          destaques.map((d) => (
            <span key={`${d.ponto}-${d.grandeza}`} className="text-texto">
              {textoDoDestaque(
                d,
                formatarHoraMinuto(intervalos[d.inicio]?.inicio ?? ''),
                formatarHoraMinuto(intervalos[d.fim]?.fim ?? ''),
              )}
            </span>
          ))
        )}
      </div>

      {/* leitura do intervalo (e da célula) sob o cursor */}
      <div
        aria-live="polite"
        className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border border-linha bg-rebaixo px-2 py-1 text-12"
      >
        {intervalo ? (
          <LeituraDoCursor
            intervalo={intervalo}
            marcha={marchas[cursor ?? 0] ?? null}
            linha={linhaSobCursor === null ? undefined : linhas[linhaSobCursor]}
            classe={linhaSobCursor === null ? undefined : classes[linhaSobCursor]?.[cursor ?? 0]}
          />
        ) : (
          <span className="text-apoio">
            Passe o cursor numa célula, ou use as setas sobre o mapa, para ler o valor, o típico da
            linha e a diferença.
          </span>
        )}
      </div>

      <Legenda
        simulado={simulado}
        passoS={passoS}
        cores={cores}
        temReferencia={linhas.some((l) => l.referencia)}
      />
    </div>
  )
}

function percentual(desvio: number): string {
  const p = Math.round(desvio * 100)
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`
}

function LeituraDoCursor({
  intervalo,
  marcha,
  linha,
  classe,
}: {
  intervalo: IntervaloDoMapa
  marcha: number | null
  linha: LinhaDoMapa | undefined
  classe: ClasseDaCelula | undefined
}) {
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
            {intervalo.janelas === 1 ? 'janela' : 'janelas'} · marcha{' '}
            <span className="valor text-texto">
              {marcha === null ? TRACO : marcha === 0 ? 'parada' : formatarRpm(marcha)}
            </span>{' '}
            (medida <span className="valor text-texto">{formatarRpm(intervalo.rotacaoRpm)}</span>{' '}
            rpm)
            {intervalo.saturou ? <span className="font-medium text-texto"> · saturou</span> : null}
          </span>
          {linha && classe && classe.tipo !== 'lacuna' ? (
            <span className="whitespace-nowrap text-apoio">
              <span className="valor font-semibold text-texto">
                {linha.ponto}·{linha.grandeza}
              </span>{' '}
              <span className="valor text-texto">{formatarG(classe.valor)}</span> g
              {classe.tipo === 'sem_tipico' ? (
                <>
                  {' '}
                  ·{' '}
                  {classe.incompleto
                    ? 'intervalo incompleto (poucas janelas): sem comparação'
                    : 'sem típico (poucos intervalos nesta marcha)'}
                </>
              ) : (
                <>
                  {' '}
                  · típico <span className="valor text-texto">{formatarG(classe.tipico)}</span> g ·{' '}
                  <span className="valor text-texto">{percentual(classe.desvio)}</span>{' '}
                  {classe.tipo === 'tipico'
                    ? `(dentro de ±${Math.round(FAIXA_MORTA * 100)}%)`
                    : `(${classe.tipo} do típico)`}
                </>
              )}
            </span>
          ) : linha ? (
            <span className="text-apoio">
              {linha.ponto}·{linha.grandeza}: sem valor neste intervalo
            </span>
          ) : (
            <span className="text-apoio">escolha uma linha (setas para cima e para baixo)</span>
          )}
        </>
      )}
    </>
  )
}

function Legenda({
  simulado,
  passoS,
  cores,
  temReferencia,
}: {
  simulado: boolean
  passoS: number
  cores: CoresDoCanvas
  temReferencia: boolean
}) {
  const faixa = Math.round(FAIXA_MORTA * 100)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-apoio">
      <span className="flex items-center gap-1.5">
        <span
          className="size-3 border border-linha"
          style={{ backgroundColor: tomDaCelula(0, cores) }}
          aria-hidden="true"
        />
        tom igual = dentro de ±{faixa}% do típico da linha
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex border border-linha" aria-hidden="true">
          {[0, 0.35, 0.7, 1].map((t) => (
            <span key={t} className="size-3" style={{ backgroundColor: tomDaCelula(t, cores) }} />
          ))}
        </span>
        mais contraste = acima do típico
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="size-3 border border-linha"
          style={{
            backgroundColor: tomDaCelula(0, cores),
            backgroundImage: `radial-gradient(${pontoAbaixo(cores)} 1px, transparent 1px)`,
            backgroundSize: '4px 4px',
          }}
          aria-hidden="true"
        />
        pontilhado = abaixo
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="size-3 border border-dashed border-linha-forte bg-modulo"
          aria-hidden="true"
        />
        tracejado = lacuna
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1 w-3 bg-texto" aria-hidden="true" />
        saturação
      </span>
      {temReferencia ? (
        <>
          <span className="flex items-center gap-1.5">
            <span
              className="flex size-3 items-center justify-center border border-atencao-sobre bg-atencao text-[7px] leading-none text-fundo"
              aria-hidden="true"
            >
              ▲
            </span>
            acima do limite de atenção (▲)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="flex size-3 items-center justify-center bg-alarme text-[7px] leading-none text-fundo"
              aria-hidden="true"
            >
              ◆
            </span>
            acima do limite de alarme (◆)
          </span>
        </>
      ) : (
        <span>sem cor de alarme até existir referência</span>
      )}
      {simulado ? (
        <span className="flex items-center gap-1.5">
          <SeloSim /> moldura hachurada: dado simulado
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
  classes: readonly ClasseDaCelula[][]
  cores: CoresDoCanvas
}

function desenhar(ctx: CanvasRenderingContext2D, d: Desenho) {
  const total = d.intervalos.length
  ctx.clearRect(0, 0, d.largura, d.altura)
  if (total === 0) return
  const passo = d.largura / total

  const corDosPontos = pontoAbaixo(d.cores)
  d.linhas.forEach((linha, i) => {
    const y = d.ys[i]
    const classes = d.classes[i]
    if (y === undefined || !classes) return
    for (let k = 0; k < total; k++) {
      const classe = classes[k]
      if (!classe || classe.tipo === 'lacuna') continue
      const x0 = Math.floor(k * passo)
      const x1 = Math.floor((k + 1) * passo)
      const larguraDaCelula = Math.max(1, x1 - x0)
      const referencia = linha.referencia
      // com referência aprendida (prompt futuro), atenção e alarme vencem a comparação com o típico
      if (referencia && classe.valor >= referencia.alarme) ctx.fillStyle = d.cores.alarme
      else if (referencia && classe.valor >= referencia.atencao) ctx.fillStyle = d.cores.atencao
      else ctx.fillStyle = tomDaCelula(classe.tipo === 'acima' ? classe.intensidade : 0, d.cores)
      ctx.fillRect(x0, y, larguraDaCelula, ALTURA_DA_LINHA - 1)
      // forma além da cor (2 de 3 canais), as mesmas do resto do painel: triângulo = atenção,
      // losango = alarme; só quando a célula tem largura para a forma
      const estado =
        referencia && classe.valor >= referencia.alarme
          ? 'alarme'
          : referencia && classe.valor >= referencia.atencao
            ? 'atencao'
            : null
      if (estado && larguraDaCelula >= 7) {
        const cx = x0 + larguraDaCelula / 2
        const cy = y + (ALTURA_DA_LINHA - 1) / 2
        const r = Math.min(4, (larguraDaCelula - 2) / 2)
        ctx.fillStyle = d.cores.fundo
        ctx.beginPath()
        if (estado === 'atencao') {
          ctx.moveTo(cx, cy - r)
          ctx.lineTo(cx + r, cy + r)
          ctx.lineTo(cx - r, cy + r)
        } else {
          ctx.moveTo(cx, cy - r)
          ctx.lineTo(cx + r, cy)
          ctx.lineTo(cx, cy + r)
          ctx.lineTo(cx - r, cy)
        }
        ctx.closePath()
        ctx.fill()
      }
      if (classe.tipo === 'abaixo') {
        ctx.fillStyle = corDosPontos
        for (let px = x0 + 1; px < x0 + larguraDaCelula; px += 3) {
          for (let py = y + 2; py < y + ALTURA_DA_LINHA - 2; py += 3) ctx.fillRect(px, py, 1, 1)
        }
      }
    }
  })

  // lacuna (intervalo sem janela, inclusive antes da primeira do período): contorno tracejado, o
  // mesmo símbolo da legenda; nunca pontos, que querem dizer "abaixo do típico"
  ctx.save()
  ctx.strokeStyle = d.cores.linhaForte
  ctx.lineWidth = 1
  ctx.setLineDash([2, 2])
  let k = 0
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

  // marca de saturação no topo do intervalo
  ctx.fillStyle = d.cores.texto
  d.intervalos.forEach((intervalo, k) => {
    if (!intervalo.saturou) return
    const x0 = Math.floor(k * passo)
    ctx.fillRect(x0, 1, Math.max(2, Math.floor((k + 1) * passo) - x0), ALTURA_DA_MARCA - 4)
  })
}

/** Largura da coluna de rótulos, em caracteres da fonte monoespaçada: "MANCAL-T2·RMS" cabe inteiro. */
function larguraDosRotulos(linhas: readonly { ponto: string; grandeza: string }[]): number {
  return (
    Math.max(6, ...linhas.map((l) => grafemas(l.ponto).length + 1 + grafemas(l.grandeza).length)) +
    0.5
  )
}

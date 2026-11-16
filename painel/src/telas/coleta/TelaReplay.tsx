import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef } from 'react'

import { consultaEnsaio, consultaEventosMarcados, consultaJanelasDoEnsaio } from '@/api/coleta'
import { consultaMaquina, consultaPontos } from '@/api/consultas'
import type { Ensaio, Janela } from '@/api/tipos'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { GraficoTendencia, type SerieDoGrafico } from '@/componentes/instrumento/GraficoTendencia'
import { Leitura } from '@/componentes/instrumento/Leitura'
import { MarcadorPonto } from '@/componentes/instrumento/MarcadorPonto'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Tacometro } from '@/componentes/instrumento/Tacometro'
import { Button } from '@/componentes/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/componentes/ui/toggle-group'
import { ROTULO_CONDICAO } from '@/dominio/coleta'
import { formatarCronometro } from '@/dominio/fita'
import { formatarCurtose, formatarDataHora, formatarG, formatarHora } from '@/dominio/formato'
import { ordenarCodigos, rotuloDoPapel } from '@/dominio/pontos'
import {
  alternar,
  avancar,
  emLacuna,
  estadoInicial,
  indiceAtual,
  lacunasDaLinha,
  linhaDoTempo,
  mudarVelocidade,
  ordenarJanelas,
  saltar,
  VELOCIDADES,
  type EstadoReplay,
  type Velocidade,
} from '@/dominio/replay'
import { definirTransporte, definirUltimaObservacao } from '@/estado/transporte'

type Acao =
  | { tipo: 'quadro'; dtS: number; duracaoS: number }
  | { tipo: 'alternar' }
  | { tipo: 'saltar'; posicaoS: number; duracaoS: number }
  | { tipo: 'velocidade'; velocidade: Velocidade }

function relogio(estado: EstadoReplay, acao: Acao): EstadoReplay {
  switch (acao.tipo) {
    case 'quadro':
      return avancar(estado, acao.dtS, acao.duracaoS)
    case 'alternar':
      return alternar(estado)
    case 'saltar':
      return saltar(estado, acao.posicaoS, acao.duracaoS)
    case 'velocidade':
      return mudarVelocidade(estado, acao.velocidade)
  }
}

const MOTIVO: Record<string, string> = {
  pancada: 'pancada',
  cavaco: 'cavaco',
  maquina_vizinha: 'máquina vizinha',
  outro: 'outro',
}

/**
 * Replay: reproduz um ensaio gravado nos mesmos instrumentos da tela da máquina, com linha do tempo,
 * cursor arrastável, pausa e 1×, 4×, 16×. Faixa permanente "REPLAY" num padrão neutro próprio; a
 * barra superior troca "última janela há X s" por "REPLAY". Nada usa a cor de sinal do dado ao vivo.
 */
export function TelaReplay({ ensaioId }: { ensaioId: number }) {
  const ensaio = useQuery(consultaEnsaio(ensaioId))
  const janelas = useQuery(consultaJanelasDoEnsaio(ensaioId))
  const eventos = useQuery(consultaEventosMarcados(ensaioId))
  const maquinaId = ensaio.data?.maquina_id
  const maquina = useQuery({ ...consultaMaquina(maquinaId ?? 0), enabled: maquinaId !== undefined })
  const pontos = useQuery({ ...consultaPontos(maquinaId ?? 0), enabled: maquinaId !== undefined })

  // a barra superior diz REPLAY enquanto esta tela está aberta
  useEffect(() => {
    definirTransporte('replay')
    definirUltimaObservacao(null)
    return () => definirTransporte('inativo')
  }, [])
  const codigo = ensaio.data?.codigo
  useEffect(() => {
    document.title = codigo ? `Replay ${codigo} · PredictSpin` : 'Replay · PredictSpin'
  }, [codigo])

  if (ensaio.isPending || janelas.isPending)
    return <EstadoCarregando rotulo="Carregando o ensaio…" />
  if (ensaio.isError) return <EstadoErro erro={ensaio.error} />
  if (janelas.isError) return <EstadoErro erro={janelas.error} />

  return (
    <Reprodutor
      ensaio={ensaio.data}
      janelas={janelas.data}
      eventos={(eventos.data ?? []).map((e) => ({ instante: e.ocorrido_em, motivo: e.motivo }))}
      nominais={maquina.data?.rotacoes_nominais_rpm ?? []}
      pontos={ordenarCodigos((pontos.data ?? []).filter((p) => p.ativo).map((p) => p.codigo)).map(
        (c) => ({
          codigo: c,
          papel: rotuloDoPapel(pontos.data?.find((p) => p.codigo === c)?.papel ?? ''),
        }),
      )}
    />
  )
}

type PropsReprodutor = {
  ensaio: Ensaio
  janelas: Janela[]
  eventos: { instante: string; motivo: string }[]
  nominais: readonly number[]
  pontos: { codigo: string; papel: string }[]
}

function Reprodutor({ ensaio, janelas: janelasDaApi, eventos, nominais, pontos }: PropsReprodutor) {
  const janelas = useMemo(() => ordenarJanelas(janelasDaApi), [janelasDaApi])
  const linha = useMemo(() => linhaDoTempo(janelas), [janelas])
  const [estado, despachar] = useReducer(relogio, undefined, estadoInicial)
  const ultimoQuadro = useRef<number | null>(null)

  // quadro a quadro enquanto toca (requestAnimationFrame); pausado, nada roda
  useEffect(() => {
    if (!estado.tocando) {
      ultimoQuadro.current = null
      return
    }
    let pedido = 0
    const quadro = (agora: number) => {
      const anterior = ultimoQuadro.current ?? agora
      ultimoQuadro.current = agora
      despachar({ tipo: 'quadro', dtS: (agora - anterior) / 1000, duracaoS: linha.duracaoS })
      pedido = requestAnimationFrame(quadro)
    }
    pedido = requestAnimationFrame(quadro)
    return () => cancelAnimationFrame(pedido)
  }, [estado.tocando, linha.duracaoS])

  // espaço toca e pausa (fora de campos)
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo?.closest('input, textarea, select, button, [role="slider"]')) return
      if (e.key === ' ') {
        e.preventDefault()
        despachar({ tipo: 'alternar' })
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  const indice = indiceAtual(linha.temposS, estado.posicaoS)
  const lacuna = emLacuna(linha.temposS, estado.posicaoS)
  const atual = indice >= 0 && !lacuna ? janelas[indice] : undefined
  const instanteAtual = linha.inicioMs + estado.posicaoS * 1000
  const lacunas = lacunasDaLinha(linha.temposS)

  // séries até o cursor: o gráfico se desenha conforme o replay anda (nunca o traço vivo)
  const { temposS, series } = useMemo(() => {
    const ate = Math.max(0, indice + 1)
    const tempos = janelas.slice(0, ate).map((j) => Date.parse(j.medido_em) / 1000)
    return {
      temposS: tempos,
      series: pontos.slice(0, 3).map((p, i) => ({
        rotulo: p.codigo,
        valores: janelas.slice(0, ate).map((j) => j.pontos[p.codigo]?.rms_g ?? null),
        tom: (i % 3) as 0 | 1 | 2,
        espessura: i === 0 ? 2 : i === 1 ? 1.5 : 1.25,
      })) satisfies SerieDoGrafico[],
    }
  }, [janelas, indice, pontos])

  const faixa = (
    // no celular a barra superior rola com a página: a faixa REPLAY fica presa no topo, para que
    // nada do replay, em nenhuma altura da página, pareça dado ao vivo
    <div
      className="trama-replay flex flex-wrap items-center gap-x-3 gap-y-1 border border-linha-forte bg-fundo px-3 py-1.5 max-sm:sticky max-sm:top-0 max-sm:z-30"
      role="status"
      data-testid="faixa-replay"
    >
      <span className="bg-modulo px-1 text-13 font-semibold tracking-[0.12em] text-texto">
        REPLAY
      </span>
      <span className="bg-modulo px-1 text-13 text-texto">
        <span className="valor">{ensaio.codigo}</span> · gravado em{' '}
        <span className="valor">{formatarDataHora(ensaio.iniciado_em)}</span>
      </span>
      {ensaio.simulado ? <SeloSim /> : null}
      <span className="bg-modulo px-1 text-12 text-apoio">não é dado ao vivo</span>
    </div>
  )

  if (janelas.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Caminho codigo={ensaio.codigo} maquinaId={ensaio.maquina_id} />
        {faixa}
        <Painel className="max-w-2xl">
          <Modulo rotulo="Replay" semRecuo>
            <EstadoVazio titulo="Este ensaio não tem janelas.">
              Nenhuma janela chegou enquanto ele estava aberto; não há o que reproduzir.
            </EstadoVazio>
          </Modulo>
        </Painel>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="replay">
      <Caminho codigo={ensaio.codigo} maquinaId={ensaio.maquina_id} />
      {faixa}
      <p className="text-13 text-apoio">
        <span className="valor text-texto">{ensaio.etapa}</span> ·{' '}
        {ROTULO_CONDICAO[ensaio.condicao]} · alvo{' '}
        <span className="valor">{ensaio.rotacao_alvo_rpm}</span> rpm ·{' '}
        <span className="valor">{janelas.length}</span> janelas
        {ensaio.descartado ? ' · descartado' : ''}
      </p>

      {/* controles */}
      <Painel>
        <Modulo rotulo="Linha do tempo" simulado={ensaio.simulado}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="default"
                className="min-h-11 min-w-28"
                onClick={() => despachar({ tipo: 'alternar' })}
                aria-label={estado.tocando ? 'Pausar' : estado.fim ? 'Tocar do início' : 'Tocar'}
              >
                {estado.tocando ? (
                  <Pause aria-hidden="true" strokeWidth={1.75} />
                ) : estado.fim ? (
                  <RotateCcw aria-hidden="true" strokeWidth={1.75} />
                ) : (
                  <Play aria-hidden="true" strokeWidth={1.75} />
                )}
                {estado.tocando ? 'Pausar' : estado.fim ? 'De novo' : 'Tocar'}
              </Button>
              <ToggleGroup
                aria-label="Velocidade"
                value={[String(estado.velocidade)]}
                onValueChange={(v) => {
                  const n = Number(v[0])
                  if ((VELOCIDADES as readonly number[]).includes(n))
                    despachar({ tipo: 'velocidade', velocidade: n as Velocidade })
                }}
              >
                {VELOCIDADES.map((v) => (
                  <ToggleGroupItem key={v} value={String(v)} aria-label={`Velocidade ${v} vezes`}>
                    <span className="valor">{v}×</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <span className="valor text-15 text-texto" data-testid="tempo-replay">
                {formatarCronometro(estado.posicaoS)} / {formatarCronometro(linha.duracaoS)}
              </span>
              <span className="text-13 text-apoio">
                medido às <span className="valor">{formatarHora(instanteAtual)}</span>
              </span>
              {estado.fim ? (
                <span className="border border-linha-forte px-1.5 text-12 tracking-[0.06em] text-texto uppercase">
                  fim
                </span>
              ) : null}
            </div>
            <Trilho
              posicaoS={estado.posicaoS}
              duracaoS={linha.duracaoS}
              aoSaltar={(p) => despachar({ tipo: 'saltar', posicaoS: p, duracaoS: linha.duracaoS })}
              inicioMs={linha.inicioMs}
              temposS={linha.temposS}
              lacunas={lacunas}
              eventos={eventos}
            />
          </div>
        </Modulo>
      </Painel>

      {/* os mesmos instrumentos da tela da máquina */}
      <Painel className="xl:grid-cols-12">
        <Modulo rotulo="Rotação" simulado={ensaio.simulado} className="xl:col-span-4">
          <Tacometro rpm={atual?.rotacao_rpm} nominais={nominais} gravado />
        </Modulo>
        <div className="flex min-w-0 flex-col gap-px bg-linha xl:col-span-8 [&>section]:flex-1">
          {lacuna ? (
            <Modulo rotulo="Janela">
              <p className="border border-dashed border-linha-forte px-2 py-1 text-13 text-texto">
                Lacuna: nenhuma janela neste trecho da gravação.
              </p>
            </Modulo>
          ) : null}
          {pontos.map((p) => {
            const m = atual?.pontos[p.codigo]
            return (
              <Modulo
                key={p.codigo}
                rotulo={`Ponto ${p.codigo}`}
                detalhe={p.papel}
                simulado={ensaio.simulado}
              >
                <div className="flex items-start gap-3">
                  <MarcadorPonto codigo={p.codigo} className="mt-1" />
                  <div className="grid min-w-0 flex-1 grid-cols-3 gap-x-3 gap-y-2 @min-[40rem]:grid-cols-6">
                    <Leitura
                      rotulo="RMS"
                      valor={formatarG(m?.rms_g)}
                      unidade="g"
                      tamanho="grande"
                    />
                    <Leitura rotulo="Pico" valor={formatarG(m?.pico_g)} unidade="g" />
                    <Leitura rotulo="Curt" titulo="curtose" valor={formatarCurtose(m?.curtose)} />
                    <Leitura rotulo="1X" valor={formatarG(m?.o1x)} unidade="g" />
                    <Leitura rotulo="2X" valor={formatarG(m?.o2x)} unidade="g" />
                    <Leitura rotulo="3X" valor={formatarG(m?.o3x)} unidade="g" />
                  </div>
                </div>
              </Modulo>
            )
          })}
        </div>
        <Modulo
          rotulo="RMS dos pontos"
          detalhe="desenhado até o cursor do replay"
          simulado={ensaio.simulado}
          className="xl:col-span-12"
          semRecuo
        >
          <GraficoTendencia
            temposS={temposS}
            series={series}
            altura={220}
            unidade="g"
            casas={3}
            inicioS={linha.inicioMs / 1000}
            fimS={linha.inicioMs / 1000 + linha.duracaoS}
            referencia={null}
            descricao={`RMS dos pontos no replay do ensaio ${ensaio.codigo}`}
          />
        </Modulo>
      </Painel>
    </div>
  )
}

function Caminho({ codigo, maquinaId }: { codigo: string; maquinaId: number }) {
  return (
    <nav aria-label="Caminho" className="text-12 text-apoio">
      <Link to="/coleta" search={{ maquina: maquinaId }} className="underline underline-offset-2">
        Coleta
      </Link>{' '}
      /{' '}
      <Link
        to="/coleta/ensaios"
        search={{ maquina: maquinaId }}
        className="underline underline-offset-2"
      >
        Ensaios
      </Link>{' '}
      / <span aria-current="page">Replay {codigo}</span>
    </nav>
  )
}

/**
 * Trilho da linha do tempo: cursor arrastável (é um slider nativo, acessível pelo teclado), cada
 * janela como um traço, lacunas tracejadas e eventos marcados com ▾.
 */
function Trilho({
  posicaoS,
  duracaoS,
  aoSaltar,
  inicioMs,
  temposS,
  lacunas,
  eventos,
}: {
  posicaoS: number
  duracaoS: number
  aoSaltar: (s: number) => void
  inicioMs: number
  temposS: number[]
  lacunas: [number, number][]
  eventos: { instante: string; motivo: string }[]
}) {
  const fracao = (s: number) => (duracaoS > 0 ? Math.min(1, Math.max(0, s / duracaoS)) : 0)
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-10 border border-linha-forte bg-rebaixo" data-testid="trilho">
        {temposS.map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="absolute top-3 bottom-3 w-px bg-linha-forte"
            style={{ left: `${fracao(t) * 100}%` }}
          />
        ))}
        {lacunas.map(([a, b]) => (
          <span
            key={a}
            aria-hidden="true"
            className="absolute inset-y-1 border border-dashed border-linha-forte bg-modulo"
            style={{ left: `${fracao(a) * 100}%`, width: `${(fracao(b) - fracao(a)) * 100}%` }}
          />
        ))}
        {eventos.map((e) => {
          const s = (Date.parse(e.instante) - inicioMs) / 1000
          return (
            <span
              key={e.instante}
              className="absolute inset-y-0 border-l-2 border-dashed border-texto"
              style={{ left: `${fracao(s) * 100}%` }}
              title={`evento marcado: ${MOTIVO[e.motivo] ?? e.motivo}`}
              data-testid="evento-na-linha"
            >
              <span aria-hidden="true" className="absolute -top-1 -left-[5px] text-12 leading-none">
                ▾
              </span>
            </span>
          )
        })}
        {/* cursor (posição atual) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-texto"
          style={{ left: `${fracao(posicaoS) * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={Math.max(0.001, duracaoS)}
          step={0.5}
          value={posicaoS}
          onChange={(e) => aoSaltar(Number(e.target.value))}
          aria-label="Posição no replay"
          aria-valuetext={`${formatarCronometro(posicaoS)} de ${formatarCronometro(duracaoS)}`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 text-12 text-apoio">
        <span className="valor">{formatarHora(inicioMs)}</span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-3 w-px bg-linha-forte" /> janela
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-3 w-3 border border-dashed border-linha-forte" />{' '}
          lacuna
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true">▾</span> evento marcado
          {eventos.length > 0 ? ` (${eventos.length})` : ''}
        </span>
        <span className="ml-auto valor">{formatarHora(inicioMs + duracaoS * 1000)}</span>
      </div>
    </div>
  )
}

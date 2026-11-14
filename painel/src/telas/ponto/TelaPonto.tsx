import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleStop, Download, Radio } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { transicaoDoPonto } from '@/lib/transicao'

import {
  consultaEnsaios,
  consultaJanelasDoPeriodo,
  consultaMaquina,
  consultaPontos,
  consultaSeriePeriodo,
} from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import type { Janela, Ponto } from '@/api/tipos'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { GraficoTendencia, type SerieDoGrafico } from '@/componentes/instrumento/GraficoTendencia'
import { MarcaDeIdade } from '@/componentes/instrumento/Idade'
import { Leitura } from '@/componentes/instrumento/Leitura'
import { MarcadorPonto } from '@/componentes/instrumento/MarcadorPonto'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SeloAvaliacao } from '@/componentes/instrumento/Selos'
import { Button } from '@/componentes/ui/button'
import { Input } from '@/componentes/ui/input'
import { Label } from '@/componentes/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/componentes/ui/toggle-group'
import { gerarCsv, nomeDeArquivo } from '@/dominio/csv'
import {
  formatarCurtose,
  formatarG,
  formatarIntervalo,
  formatarNumero,
  formatarPrazo,
} from '@/dominio/formato'
import type { Frescor } from '@/dominio/idade'
import { podeAbrir } from '@/dominio/papeis'
import {
  MENSAGEM_PERIODO,
  PERIODO_TENDENCIA_PADRAO,
  PERIODOS_TENDENCIA,
  fimAlinhadoMs,
  planoDoPeriodo,
  validarPeriodo,
  type ChavePeriodoTendencia,
  type ErroDePeriodo,
  type FonteDaTendencia,
} from '@/dominio/periodos'
import { rotuloDoPapel } from '@/dominio/pontos'
import {
  faixasDasJanelas,
  faixasDosEnsaios,
  linhasParaCsv,
  tendenciaDeJanelas,
  tendenciaDeSerie,
  unirJanelas,
  type DadosDaTendencia,
} from '@/dominio/tendencia'
import { useSegundo } from '@/estado/relogio'
import { useEmTela } from '@/hooks/useEmTela'
import { useFrescorDaMaquina } from '@/hooks/useFrescorDaMaquina'
import { useMaquinaAoVivo } from '@/hooks/useMaquinaAoVivo'
import { useModoRapido } from '@/hooks/useModoRapido'
import type { BuscaDoPonto } from '@/rotas/_painel/maquinas.$maquinaId.pontos.$codigo'

import { TabelaDeJanelas } from './TabelaDeJanelas'
import { Unidade } from '@/componentes/instrumento/Unidade'

type Props = {
  maquinaId: number
  codigo: string
  busca: BuscaDoPonto
}

type Periodo = {
  chave: ChavePeriodoTendencia
  deMs: number
  ateMs: number
  fonte: FonteDaTendencia
  baldes: number
  /** Período que acompanha o relógio (os pré-definidos); o personalizado é fixo. */
  movel: boolean
  erro: ErroDePeriodo | null
}

/** De quanto em quanto o fim de cada período pré-definido avança (e a consulta é refeita). */
const ALINHAMENTO_S: Record<Exclude<ChavePeriodoTendencia, 'personalizado'>, number> = {
  '15min': 60,
  '1h': 300,
  '8h': 60,
  '24h': 150,
}

/** Largura do gráfico ao vivo, em segundos. */
const AO_VIVO_SEGUNDOS = 60

function usePeriodo(busca: BuscaDoPonto): Periodo {
  const { epocaMs } = useSegundo()
  const { periodo: chave, de, ate } = busca
  const preset = PERIODOS_TENDENCIA.find((p) => p.chave === chave) ?? PERIODO_TENDENCIA_PADRAO
  // o período pré-definido só muda quando o fim alinhado muda; o personalizado, a cada minuto
  // (para a validação "início no futuro")
  const marcaMs = fimAlinhadoMs(
    epocaMs,
    chave === 'personalizado' ? 60 : ALINHAMENTO_S[preset.chave],
  )
  return useMemo(() => {
    if (chave === 'personalizado') {
      const deMs = de ? Date.parse(de) : Number.NaN
      const ateMs = ate ? Date.parse(ate) : Number.NaN
      const erro = validarPeriodo(deMs, ateMs, marcaMs)
      const plano = erro
        ? { fonte: 'brutos' as const, baldes: 0 }
        : planoDoPeriodo((ateMs - deMs) / 1000)
      return { chave, deMs, ateMs, ...plano, movel: false, erro }
    }
    return {
      chave: preset.chave,
      deMs: marcaMs - preset.segundos * 1000,
      ateMs: marcaMs,
      fonte: preset.fonte,
      baldes: preset.baldes,
      movel: true,
      erro: null,
    }
  }, [chave, de, ate, marcaMs, preset])
}

/**
 * L3 — Ponto. Tendência com retícula (RMS e pico; curtose ou ordens; rotação em faixa própria),
 * ensaios do período, lacunas e saturação visíveis, tabela das janelas, CSV e o modo AO VIVO.
 */
export function TelaPonto({ maquinaId, codigo, busca }: Props) {
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const maquina = useQuery(consultaMaquina(maquinaId))
  const pontos = useQuery(consultaPontos(maquinaId))
  const aoVivo = useMaquinaAoVivo(maquinaId)
  const { frescor, idadeS, velho } = useFrescorDaMaquina(aoVivo.ultima, aoVivo.modoRapido)
  const periodo = usePeriodo(busca)
  const { epocaMs } = useSegundo()
  const navegar = useNavigate({ from: '/maquinas/$maquinaId/pontos/$codigo' })

  const graficoRef = useRef<HTMLDivElement>(null)
  const graficoVisivel = useEmTela(graficoRef)
  const modoRapido = useModoRapido(maquinaId, aoVivo.modoRapido, graficoVisivel)

  const usaBrutos = periodo.fonte === 'brutos' && !periodo.erro
  const usaAgregado = periodo.fonte === 'agregado' && !periodo.erro
  const brutos = useQuery({
    ...consultaJanelasDoPeriodo(maquinaId, aoVivo.simulado, periodo.deMs, periodo.ateMs),
    enabled: usaBrutos,
    placeholderData: (anterior) => anterior,
  })
  const agregado = useQuery({
    ...consultaSeriePeriodo(
      maquinaId,
      aoVivo.simulado,
      periodo.deMs,
      periodo.ateMs,
      periodo.baldes,
    ),
    enabled: usaAgregado,
    placeholderData: (anterior) => anterior,
  })
  const podeVerEnsaios = podeAbrir(papel, 'ensaios')
  const ensaios = useQuery({
    ...consultaEnsaios(maquinaId, aoVivo.simulado),
    enabled: podeVerEnsaios,
  })

  // nos dados brutos, o que chegou ao vivo depois da consulta entra na ponta do gráfico
  const janelasDoPeriodo = useMemo(() => {
    if (!usaBrutos) return []
    const noPeriodo = (j: Janela) => {
      const t = Date.parse(j.medido_em)
      return t >= periodo.deMs && t < periodo.ateMs
    }
    return unirJanelas(
      brutos.data ?? [],
      periodo.movel ? aoVivo.recentes.filter(noPeriodo) : [],
    ).filter(noPeriodo)
  }, [usaBrutos, brutos.data, aoVivo.recentes, periodo.deMs, periodo.ateMs, periodo.movel])

  const dados: DadosDaTendencia | null = useMemo(() => {
    if (usaBrutos) return tendenciaDeJanelas(janelasDoPeriodo, codigo)
    if (usaAgregado && agregado.data) return tendenciaDeSerie(agregado.data, codigo)
    return null
  }, [usaBrutos, usaAgregado, janelasDoPeriodo, agregado.data, codigo])

  const faixas = useMemo(() => {
    if (podeVerEnsaios && ensaios.data) {
      return faixasDosEnsaios(
        ensaios.data,
        periodo.deMs / 1000,
        periodo.ateMs / 1000,
        periodo.ateMs / 1000,
      )
    }
    return usaBrutos ? faixasDasJanelas(janelasDoPeriodo) : []
  }, [podeVerEnsaios, ensaios.data, periodo.deMs, periodo.ateMs, usaBrutos, janelasDoPeriodo])

  const lista = pontos.data ?? []
  const ponto = lista.find((p) => p.codigo === codigo)
  const codigoDaMaquina = maquina.data?.codigo

  useEffect(() => {
    document.title = `Ponto ${codigo}${codigoDaMaquina ? ` · ${codigoDaMaquina}` : ''} · PredictSpin`
  }, [codigo, codigoDaMaquina])

  if (maquina.isPending || pontos.isPending) return <EstadoCarregando rotulo="Carregando ponto…" />
  if (maquina.isError) throw maquina.error
  if (pontos.isError) throw pontos.error
  if (!ponto) {
    return (
      <Painel className="max-w-2xl">
        <Modulo rotulo="Ponto" semRecuo>
          <EstadoVazio titulo={`A máquina ${maquina.data.codigo} não tem o ponto ${codigo}.`} />
        </Modulo>
      </Painel>
    )
  }

  const carregandoGrafico = usaBrutos ? brutos.isPending : usaAgregado ? agregado.isPending : false
  const erroDoGrafico = usaBrutos ? brutos.error : usaAgregado ? agregado.error : null
  const semDados = aoVivo.ultima === null
  const fimDoEixoS = periodo.movel
    ? Math.min(periodo.ateMs, fimAlinhadoMs(epocaMs, 5)) / 1000
    : periodo.ateMs / 1000
  const segundosDoPeriodo = (periodo.ateMs - periodo.deMs) / 1000

  const exportar = () => {
    if (!dados) return
    const { colunas, linhas } = linhasParaCsv(dados, faixas)
    if (linhas.length === 0) {
      toast('Não há dados no gráfico para exportar.')
      return
    }
    const arquivo = new Blob([gerarCsv(colunas, linhas)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(arquivo)
    const link = document.createElement('a')
    link.href = url
    link.download = nomeDeArquivo([
      maquina.data.codigo,
      `ponto-${codigo}`,
      aoVivo.simulado ? 'SIMULADO' : 'real',
      new Date(periodo.deMs).toISOString().slice(0, 16),
      new Date(periodo.ateMs).toISOString().slice(0, 16),
    ])
    link.click()
    URL.revokeObjectURL(url)
    toast(
      `${formatarNumero(linhas.length)} linhas exportadas${aoVivo.simulado ? ' (dados simulados)' : ''}.`,
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Caminho" className="text-12 text-apoio">
        <Link to="/" className="underline underline-offset-2">
          Visão geral
        </Link>{' '}
        /{' '}
        <Link
          to="/maquinas/$maquinaId"
          params={{ maquinaId }}
          className="valor underline underline-offset-2"
        >
          {maquina.data.codigo}
        </Link>{' '}
        /{' '}
        <span aria-current="page" className="text-texto">
          Ponto <span className="valor">{codigo}</span>
        </span>
      </nav>

      <Painel>
        <div className="flex min-w-0 bg-modulo" style={transicaoDoPonto(codigo)}>
          <CabecalhoDoPonto
            ponto={ponto}
            janela={aoVivo.ultima?.janela}
            simulado={aoVivo.simulado && !semDados}
            frescor={frescor}
            idadeS={idadeS}
            velho={velho}
          />
        </div>

        <Modulo
          rotulo={modoRapido.ativo ? 'Ao vivo' : 'Tendência'}
          simulado={aoVivo.simulado && !semDados}
          semRecuo
          detalhe={
            modoRapido.ativo
              ? 'janelas de 1 s; não entram na tendência histórica'
              : descricaoDaFonte(dados, periodo, segundosDoPeriodo)
          }
          acoes={
            <ControleAoVivo
              ativo={modoRapido.ativo}
              restantesS={modoRapido.restantesS}
              ocupado={modoRapido.ocupado}
              aoLigar={modoRapido.ligar}
              aoParar={modoRapido.parar}
            />
          }
        >
          {modoRapido.erro ? (
            <p role="alert" className="border-b border-linha px-3 py-1 text-13 text-alarme-texto">
              {mensagemDoErro(modoRapido.erro)}
            </p>
          ) : null}

          {/* no AO VIVO o quadro é fixo (últimos 60 s): período, segundo quadro e exportação
              não se aplicam e saem da tela */}
          {modoRapido.ativo ? null : (
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-linha px-3 py-2">
              <div>
                <span className="rotulo mb-1 block">Período</span>
                <ToggleGroup
                  aria-label="Período da tendência"
                  value={[periodo.chave]}
                  onValueChange={(valores) => {
                    const chave = valores[0] as ChavePeriodoTendencia | undefined
                    if (!chave) return
                    void navegar({
                      search: (anterior) => ({ ...anterior, periodo: chave, pagina: 0 }),
                      replace: true,
                      resetScroll: false,
                    })
                  }}
                >
                  {PERIODOS_TENDENCIA.map((p) => (
                    <ToggleGroupItem key={p.chave} value={p.chave} size="sm">
                      {p.rotulo}
                    </ToggleGroupItem>
                  ))}
                  <ToggleGroupItem value="personalizado" size="sm">
                    Personalizado
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              {periodo.chave === 'personalizado' ? (
                <PeriodoPersonalizado
                  de={busca.de}
                  ate={busca.ate}
                  erro={periodo.erro}
                  aoAplicar={(de, ate) =>
                    void navegar({
                      search: (anterior) => ({
                        ...anterior,
                        periodo: 'personalizado',
                        de,
                        ate,
                        pagina: 0,
                      }),
                      replace: true,
                      resetScroll: false,
                    })
                  }
                />
              ) : null}
              <div>
                <span className="rotulo mb-1 block">Segundo quadro</span>
                <ToggleGroup
                  aria-label="Grandeza do segundo quadro"
                  value={[busca.quadro]}
                  onValueChange={(valores) => {
                    const quadro = valores[0]
                    if (quadro === 'ordens' || quadro === 'curtose') {
                      void navegar({
                        search: (anterior) => ({ ...anterior, quadro }),
                        replace: true,
                        resetScroll: false,
                      })
                    }
                  }}
                >
                  <ToggleGroupItem value="ordens" size="sm">
                    Ordens 1X–3X
                  </ToggleGroupItem>
                  <ToggleGroupItem value="curtose" size="sm">
                    Curtose
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <Button
                className="ml-auto"
                onClick={exportar}
                disabled={!dados || dados.temposS.length === 0}
              >
                <Download aria-hidden="true" strokeWidth={1.5} />
                Exportar CSV
              </Button>
            </div>
          )}

          <div ref={graficoRef} className="min-w-0" data-testid="area-do-grafico">
            {modoRapido.ativo ? (
              <QuadroAoVivo recentes={aoVivo.recentes} codigo={codigo} />
            ) : periodo.erro ? (
              <EstadoVazio titulo={MENSAGEM_PERIODO[periodo.erro]}>
                Escolha o início e o fim do período personalizado e aplique.
              </EstadoVazio>
            ) : carregandoGrafico ? (
              <EstadoCarregando rotulo="Carregando a tendência…" />
            ) : erroDoGrafico ? (
              <EstadoErro erro={erroDoGrafico} />
            ) : !dados || dados.janelas === 0 ? (
              <EstadoVazio
                titulo={`Nenhuma janela ${aoVivo.simulado ? 'simulada' : 'real'} neste período.`}
              >
                A tendência aparece assim que houver janelas do ponto {codigo} no período escolhido.
              </EstadoVazio>
            ) : (
              <QuadroHistorico
                dados={dados}
                faixas={faixas}
                quadro={busca.quadro}
                inicioS={periodo.deMs / 1000}
                fimS={fimDoEixoS}
                codigo={codigo}
              />
            )}
          </div>
        </Modulo>

        <Modulo rotulo="Janelas do período" simulado={aoVivo.simulado && !semDados} semRecuo>
          {periodo.erro ? (
            <EstadoVazio titulo={MENSAGEM_PERIODO[periodo.erro]} />
          ) : (
            <TabelaDeJanelas
              maquinaId={maquinaId}
              simulado={aoVivo.simulado}
              codigo={codigo}
              deMs={periodo.deMs}
              ateMs={periodo.ateMs}
              pagina={busca.pagina}
              acompanhar={periodo.movel && busca.pagina === 0}
              aoMudarPagina={(pagina) =>
                void navegar({
                  search: (anterior) => ({ ...anterior, pagina }),
                  replace: true,
                  resetScroll: false,
                })
              }
            />
          )}
        </Modulo>
      </Painel>
    </div>
  )
}

function descricaoDaFonte(
  dados: DadosDaTendencia | null,
  periodo: Periodo,
  segundosDoPeriodo: number,
): string {
  if (periodo.erro) return ''
  if (periodo.fonte === 'agregado') {
    const passo = dados?.passoS ?? segundosDoPeriodo / Math.max(1, periodo.baldes)
    return `AGREGADO: média do RMS e das ordens e máximo do pico a cada ${formatarIntervalo(passo)}`
  }
  return 'dados brutos: uma amostra por janela de 5 s'
}

type PropsDoCabecalho = {
  ponto: Ponto
  janela: Janela | undefined
  simulado: boolean
  frescor: Frescor
  idadeS: number | null
  velho: boolean
}

function CabecalhoDoPonto({ ponto, janela, simulado, frescor, idadeS, velho }: PropsDoCabecalho) {
  const medida = janela?.pontos[ponto.codigo]
  return (
    <Modulo
      // o título da tela (h1) já diz "Ponto B": o módulo diz o que mostra
      rotulo="Leitura atual"
      detalhe={`${rotuloDoPapel(ponto.papel)} · ${ponto.descricao}`}
      simulado={simulado}
      className="flex-1"
      acoes={
        <>
          <MarcaDeIdade frescor={frescor} idadeS={idadeS} />
          <SeloAvaliacao avaliacao="sem_referencia" />
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <MarcadorPonto codigo={ponto.codigo} />
          <h1 className="text-18 font-semibold">
            Ponto <span className="valor">{ponto.codigo}</span>
          </h1>
        </div>
        {/* estreito: as leituras descem para baixo do título, em duas ou três colunas, sem cortar valor */}
        <div className="grid flex-1 basis-full grid-cols-2 gap-x-6 gap-y-2 @min-[30rem]:grid-cols-3 @min-[44rem]:basis-0 @min-[60rem]:grid-cols-6">
          {/* RMS é a decisão: destaque, como na tela da máquina (linha própria no estreito) */}
          <Leitura
            rotulo="RMS"
            valor={formatarG(medida?.rms_g)}
            unidade="g"
            tamanho="destaque"
            velho={velho}
            className="col-span-2 @min-[30rem]:col-span-1"
          />
          <Leitura
            rotulo="Pico"
            valor={formatarG(medida?.pico_g)}
            unidade="g"
            tamanho="grande"
            velho={velho}
          />
          <Leitura
            rotulo="Curt"
            titulo="curtose"
            valor={formatarCurtose(medida?.curtose)}
            tamanho="grande"
            velho={velho}
          />
          <Leitura
            rotulo="1X"
            valor={formatarG(medida?.o1x)}
            unidade="g"
            tamanho="grande"
            velho={velho}
          />
          <Leitura
            rotulo="2X"
            valor={formatarG(medida?.o2x)}
            unidade="g"
            tamanho="grande"
            velho={velho}
          />
          <Leitura
            rotulo="3X"
            valor={formatarG(medida?.o3x)}
            unidade="g"
            tamanho="grande"
            velho={velho}
          />
        </div>
      </div>
      {janela && !medida ? (
        <p className="mt-2 border border-dashed border-linha-forte px-2 py-1 text-12 text-texto">
          A última janela não trouxe o ponto {ponto.codigo}.
        </p>
      ) : null}
    </Modulo>
  )
}

type PropsDoControle = {
  ativo: boolean
  restantesS: number
  ocupado: boolean
  aoLigar: () => void
  aoParar: () => void
}

function ControleAoVivo({ ativo, restantesS, ocupado, aoLigar, aoParar }: PropsDoControle) {
  if (!ativo) {
    return (
      <Button
        size="sm"
        variant="sinal"
        onClick={aoLigar}
        disabled={ocupado}
        aria-label="Ligar o modo ao vivo: janelas de 1 s por 2 minutos"
      >
        <Radio aria-hidden="true" strokeWidth={1.5} />
        AO VIVO
      </Button>
    )
  }
  return (
    <>
      <span
        role="status"
        className="flex items-center gap-1.5 text-12 font-medium whitespace-nowrap text-sinal"
        data-testid="ao-vivo"
      >
        <Radio
          aria-hidden="true"
          className="size-4 motion-safe:animate-[pulso-ao-vivo_1s_linear_infinite]"
          strokeWidth={1.5}
        />
        AO VIVO 1 s · termina em <span className="valor">{formatarPrazo(restantesS)}</span>
      </span>
      <Button size="sm" variant="sinal" onClick={aoParar} disabled={ocupado}>
        <CircleStop aria-hidden="true" strokeWidth={1.5} />
        Parar
      </Button>
    </>
  )
}

/** Para o campo datetime-local: instante ISO no fuso do navegador, sem segundos. */
function paraCampoLocal(iso: string | undefined): string {
  if (!iso) return ''
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function PeriodoPersonalizado({
  de,
  ate,
  erro,
  aoAplicar,
}: {
  de: string | undefined
  ate: string | undefined
  erro: ErroDePeriodo | null
  aoAplicar: (de: string, ate: string) => void
}) {
  const [inicio, setInicio] = useState(() => paraCampoLocal(de))
  const [fim, setFim] = useState(() => paraCampoLocal(ate))
  const [erroLocal, setErroLocal] = useState<ErroDePeriodo | null>(null)
  const mostrado = erroLocal ?? (de && ate ? erro : null)

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(evento) => {
        evento.preventDefault()
        const deMs = new Date(inicio).getTime()
        const ateMs = new Date(fim).getTime()
        const invalido = validarPeriodo(deMs, ateMs, Date.now())
        setErroLocal(invalido)
        if (!invalido) aoAplicar(new Date(deMs).toISOString(), new Date(ateMs).toISOString())
      }}
    >
      <div>
        <Label htmlFor="periodo-de" className="mb-1">
          Início
        </Label>
        <Input
          id="periodo-de"
          type="datetime-local"
          value={inicio}
          onChange={(evento) => setInicio(evento.target.value)}
          className="valor w-52 text-13"
          aria-invalid={mostrado ? true : undefined}
          aria-describedby={mostrado ? 'erro-periodo' : undefined}
        />
      </div>
      <div>
        <Label htmlFor="periodo-ate" className="mb-1">
          Fim
        </Label>
        <Input
          id="periodo-ate"
          type="datetime-local"
          value={fim}
          onChange={(evento) => setFim(evento.target.value)}
          className="valor w-52 text-13"
          aria-invalid={mostrado ? true : undefined}
          aria-describedby={mostrado ? 'erro-periodo' : undefined}
        />
      </div>
      <Button type="submit">Aplicar</Button>
      {mostrado ? (
        <p id="erro-periodo" role="alert" className="basis-full text-13 text-alarme-texto">
          {MENSAGEM_PERIODO[mostrado]}
        </p>
      ) : null}
    </form>
  )
}

type PropsDoHistorico = {
  dados: DadosDaTendencia
  faixas: { inicioS: number; fimS: number; rotulo: string }[]
  quadro: 'ordens' | 'curtose'
  inicioS: number
  fimS: number
  codigo: string
}

function QuadroHistorico({ dados, faixas, quadro, inicioS, fimS, codigo }: PropsDoHistorico) {
  const agregado = dados.fonte === 'agregado'
  const principais: SerieDoGrafico[] = useMemo(
    () => [
      {
        rotulo: agregado ? 'RMS méd' : 'RMS',
        valores: dados.rms,
        tom: 0,
        espessura: 2,
      },
      {
        rotulo: agregado ? 'PICO máx' : 'PICO',
        valores: dados.pico,
        tom: 2,
        espessura: 1.25,
      },
    ],
    [agregado, dados.rms, dados.pico],
  )
  const secundarias: SerieDoGrafico[] = useMemo(
    () =>
      quadro === 'curtose'
        ? [{ rotulo: 'CURT', valores: dados.curtose, tom: 0 }]
        : [
            // séries contínuas, separadas por tom, espessura e rótulo no fim da linha: tracejado
            // se confundiria com a lacuna (linha interrompida = sem janela)
            { rotulo: '1X', valores: dados.o1x, tom: 0, espessura: 2 },
            { rotulo: '2X', valores: dados.o2x, tom: 1, espessura: 1.5 },
            { rotulo: '3X', valores: dados.o3x, tom: 2, espessura: 1.25 },
          ],
    [quadro, dados.curtose, dados.o1x, dados.o2x, dados.o3x],
  )
  const rotacao: SerieDoGrafico[] = useMemo(
    () => [{ rotulo: 'RPM', valores: dados.rotacao, tom: 1 }],
    [dados.rotacao],
  )
  const sincronia = `ponto-${codigo}`

  return (
    <div className="flex flex-col">
      <FaixaDoQuadro
        rotulo={
          <>
            RMS e pico · <Unidade>g</Unidade>
          </>
        }
      >
        <GraficoTendencia
          temposS={dados.temposS}
          series={principais}
          altura={260}
          unidade="g"
          casas={3}
          inicioS={inicioS}
          fimS={fimS}
          faixas={faixas}
          saturadas={dados.saturadasS}
          referencia={null}
          mostrarTempo={false}
          sincronia={sincronia}
          descricao={`Tendência de RMS e pico do ponto ${codigo}`}
        />
      </FaixaDoQuadro>
      <FaixaDoQuadro
        rotulo={
          quadro === 'curtose' ? (
            'Curtose'
          ) : (
            <>
              Ordens 1X, 2X e 3X · <Unidade>g</Unidade>
            </>
          )
        }
      >
        <GraficoTendencia
          temposS={dados.temposS}
          series={secundarias}
          altura={170}
          unidade={quadro === 'curtose' ? '' : 'g'}
          casas={quadro === 'curtose' ? 2 : 3}
          inicioS={inicioS}
          fimS={fimS}
          mostrarTempo={false}
          sincronia={sincronia}
          descricao={
            quadro === 'curtose'
              ? `Tendência da curtose do ponto ${codigo}`
              : `Tendência das ordens 1X, 2X e 3X do ponto ${codigo}`
          }
        />
      </FaixaDoQuadro>
      <FaixaDoQuadro rotulo="Rotação · rpm">
        <GraficoTendencia
          temposS={dados.temposS}
          series={rotacao}
          altura={120}
          unidade="rpm"
          casas={0}
          inicioS={inicioS}
          fimS={fimS}
          sincronia={sincronia}
          descricao="Rotação da máquina no período"
        />
      </FaixaDoQuadro>
      <p className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-linha px-3 py-1.5 text-12 text-apoio">
        <span>
          <span className="valor text-texto">{formatarNumero(dados.janelas)}</span>{' '}
          {dados.janelas === 1 ? 'janela normal' : 'janelas normais'} no gráfico (as rápidas, de 1
          s, ficam fora da tendência)
        </span>
        <span>linha interrompida = lacuna (sem janela)</span>
        <span>▼ no topo = janela saturada</span>
        <span>faixa com código = ensaio</span>
        <span>sem referência aprendida: faixa normal indisponível</span>
      </p>
    </div>
  )
}

function FaixaDoQuadro({
  rotulo,
  children,
}: {
  rotulo: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-linha px-1 pt-1 last:border-b-0">
      <span className="rotulo px-2">{rotulo}</span>
      {children}
    </div>
  )
}

/** Gráfico ao vivo: as janelas de 1 s dos últimos 60 s, com o tempo deslizando de forma linear. */
function QuadroAoVivo({ recentes, codigo }: { recentes: Janela[]; codigo: string }) {
  const { temposS, series, rapidas, instantesRapidos } = useMemo(() => {
    // só o trecho que pode aparecer na tela: do último instante recebido para trás
    const ultima = recentes.at(-1)
    const corte = (ultima ? Date.parse(ultima.medido_em) : 0) - (AO_VIVO_SEGUNDOS + 30) * 1000
    const janelas = recentes.filter((j) => Date.parse(j.medido_em) >= corte)
    const serieDe = (chave: 'rms_g' | 'pico_g') =>
      janelas.map((j) => j.pontos[codigo]?.[chave] ?? null)
    return {
      temposS: janelas.map((j) => Date.parse(j.medido_em) / 1000),
      rapidas: janelas.filter((j) => j.modo === 'rapido').length,
      instantesRapidos: janelas
        .filter((j) => j.modo === 'rapido')
        .map((j) => Date.parse(j.medido_em) / 1000),
      series: [
        {
          rotulo: 'RMS',
          valores: serieDe('rms_g'),
          // o traço vivo é contínuo, na cor de sinal: tracejado leria como dado faltando
          aoVivo: true,
          tom: 0,
          espessura: 1.75,
        },
        { rotulo: 'PICO', valores: serieDe('pico_g'), tom: 2, espessura: 1 },
      ] satisfies SerieDoGrafico[],
    }
  }, [recentes, codigo])

  return (
    <div className="flex flex-col" data-testid="quadro-ao-vivo">
      <FaixaDoQuadro
        rotulo={
          <>
            RMS e pico · <Unidade>g</Unidade> · últimos 60 <Unidade>s</Unidade>
          </>
        }
      >
        <GraficoTendencia
          temposS={temposS}
          series={series}
          altura={320}
          unidade="g"
          casas={3}
          deslizarS={AO_VIVO_SEGUNDOS}
          rapidas={instantesRapidos}
          referencia={null}
          descricao={`RMS e pico do ponto ${codigo} ao vivo`}
        />
      </FaixaDoQuadro>
      <p className="flex flex-wrap gap-x-4 border-t border-linha px-3 py-1.5 text-12 text-apoio">
        <span>
          <span className="valor text-texto" data-testid="janelas-rapidas">
            {rapidas}
          </span>{' '}
          janelas rápidas (1 s) na tela
        </span>
        <span>| na base = janela rápida (sem marca: janela normal, de 5 s)</span>
        <span>linha interrompida = lacuna (sem janela)</span>
        <span>o modo rápido termina sozinho no prazo ou ao sair desta tela</span>
      </p>
    </div>
  )
}

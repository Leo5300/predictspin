import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, ViewTransition } from 'react'

import {
  consultaDispositivos,
  consultaMaquina,
  consultaPontos,
  consultaSerieRecente,
} from '@/api/consultas'
import type { Janela, Ponto } from '@/api/tipos'
import { EsquemaTorno, type MarcadorNoTorno } from '@/componentes/instrumento/EsquemaTorno'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { MarcaDeIdade } from '@/componentes/instrumento/Idade'
import { Leitura } from '@/componentes/instrumento/Leitura'
import {
  MapaOrdens,
  type IntervaloDoMapa,
  type LinhaDoMapa,
} from '@/componentes/instrumento/MapaOrdens'
import { MarcadorPonto } from '@/componentes/instrumento/MarcadorPonto'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { ReguaDesvio } from '@/componentes/instrumento/ReguaDesvio'
import { PlacaEstado, SeloAvaliacao } from '@/componentes/instrumento/Selos'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Sparkline } from '@/componentes/instrumento/Sparkline'
import { Button, buttonVariants } from '@/componentes/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/componentes/ui/toggle-group'
import { estadoDaMaquina } from '@/dominio/estado'
import {
  formatarCurtose,
  formatarDataHora,
  formatarG,
  formatarHora,
  formatarNumero,
  formatarPercentual,
  formatarRpm,
  fracao,
  TRACO,
} from '@/dominio/formato'
import type { Frescor } from '@/dominio/idade'
import { PERIODO_MAPA_PADRAO, PERIODOS_MAPA, type PeriodoMapa } from '@/dominio/periodos'
import { ordenarCodigos, rotuloDoPapel, tracoDoPonto } from '@/dominio/pontos'
import { definirFonte } from '@/estado/preferencias'
import { useFrescorDaMaquina } from '@/hooks/useFrescorDaMaquina'
import { useMaquinaAoVivo } from '@/hooks/useMaquinaAoVivo'
import { cn } from '@/lib/utils'

type Props = {
  maquinaId: number
  periodoDoMapa: PeriodoMapa['chave']
}

/**
 * L2 — Máquina. Onde os sensores estão (esquema do torno), a rotação, a qualidade da última
 * janela, um módulo por ponto e o mapa de ordens. Recebe cada janela por eventos ao vivo.
 */
export function TelaMaquina({ maquinaId, periodoDoMapa }: Props) {
  const maquina = useQuery(consultaMaquina(maquinaId))
  const pontos = useQuery(consultaPontos(maquinaId))
  const aoVivo = useMaquinaAoVivo(maquinaId)
  const dispositivos = useQuery(consultaDispositivos(maquinaId, aoVivo.simulado))
  const { frescor, idadeS, velho } = useFrescorDaMaquina(aoVivo.ultima, aoVivo.modoRapido)

  const codigo = maquina.data?.codigo
  useEffect(() => {
    document.title = codigo ? `${codigo} · PredictSpin` : 'Máquina · PredictSpin'
  }, [codigo])

  if (maquina.isPending) return <EstadoCarregando rotulo="Carregando máquina…" />
  if (maquina.isError) throw maquina.error

  const janela = aoVivo.ultima?.janela
  const estado = estadoDaMaquina(frescor, janela?.rotacao_rpm)
  const pontosAtivos = (pontos.data ?? [])
    .filter((p) => p.ativo)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
  const semNenhumDado = aoVivo.ultima === null

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0">
          <nav aria-label="Caminho" className="text-12 text-apoio">
            <Link to="/" className="underline underline-offset-2">
              Visão geral
            </Link>{' '}
            /
          </nav>
          <h1 className="valor truncate text-24 font-semibold" title={maquina.data.codigo}>
            {maquina.data.codigo}
          </h1>
          <p className="truncate text-13 text-apoio">
            {maquina.data.modelo}
            {maquina.data.fabricante ? ` · ${maquina.data.fabricante}` : ''} ·{' '}
            {maquina.data.local.nome} ({maquina.data.local.uf})
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          {janela?.ensaio_codigo && !velho ? (
            <span className="flex flex-col">
              <span className="rotulo">Ensaio aberto</span>
              <span className="valor text-13 font-medium">{janela.ensaio_codigo}</span>
            </span>
          ) : null}
          <SeloAvaliacao avaliacao="sem_referencia" />
          <PlacaEstado estado={estado} className="w-52" />
        </div>
      </header>

      {semNenhumDado ? (
        <Painel>
          <Modulo rotulo={aoVivo.simulado ? 'Dados simulados' : 'Medição real'} semRecuo>
            {aoVivo.simulado ? (
              <EstadoVazio titulo="Nenhuma janela simulada recebida.">
                Ligue o simulador (analise/simulador.py continuo) para ver o painel com dados
                simulados.
              </EstadoVazio>
            ) : (
              <EstadoVazio
                titulo="Nenhuma medição real recebida."
                acao={<Button onClick={() => definirFonte('simulado')}>Ver dados simulados</Button>}
              >
                O dispositivo desta máquina ainda não enviou janelas.
              </EstadoVazio>
            )}
          </Modulo>
        </Painel>
      ) : null}

      {aoVivo.erro ? (
        <Painel>
          <Modulo rotulo="Última janela" semRecuo>
            <EstadoErro erro={aoVivo.erro} />
          </Modulo>
        </Painel>
      ) : null}

      <Painel className="xl:grid-cols-12">
        <Modulo rotulo="Sensores na máquina" className="xl:col-span-6 xl:row-span-2">
          {maquina.data.classe === 'torno' ? (
            <EsquemaTorno marcadores={marcadoresDoTorno(maquinaId, pontosAtivos)} />
          ) : (
            <ul className="flex flex-col gap-1">
              {pontosAtivos.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <LinkDoPonto maquinaId={maquinaId} ponto={p} />
                  <span className="text-13 text-apoio">
                    {rotuloDoPapel(p.papel)} · {p.descricao}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modulo>

        <Modulo
          rotulo="Rotação"
          simulado={aoVivo.simulado && !semNenhumDado}
          className="xl:col-span-2"
          acoes={
            frescor === 'vivo' ? undefined : <MarcaDeIdade frescor={frescor} idadeS={idadeS} />
          }
        >
          <div
            className="flex h-full flex-col justify-center gap-1"
            data-velho={velho || undefined}
          >
            <span
              className={cn('matriz text-32', velho ? 'text-fraco' : 'text-texto')}
              data-testid="rotacao"
            >
              {formatarRpm(janela?.rotacao_rpm)}
            </span>
            <span className="rotulo">RPM</span>
          </div>
        </Modulo>

        <Modulo
          rotulo="Última janela"
          simulado={aoVivo.simulado && !semNenhumDado}
          className="xl:col-span-4"
        >
          <QualidadeDaJanela janela={janela} velho={velho} frescor={frescor} idadeS={idadeS} />
        </Modulo>

        <Modulo rotulo="Dispositivos e canais" className="xl:col-span-6">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 @min-[34rem]:grid-cols-2">
            {dispositivos.isPending ? (
              <span className="text-13 text-apoio">Carregando…</span>
            ) : dispositivos.data && dispositivos.data.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {dispositivos.data.map((d) => (
                  <li key={d.id} className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5">
                      <span className="valor truncate text-13 font-medium" title={d.identificador}>
                        {d.identificador}
                      </span>
                      {d.simulado ? <SeloSim /> : null}
                      {!d.ativo ? <span className="text-12 text-apoio">inativo</span> : null}
                    </span>
                    <span className="text-12 text-apoio">
                      {d.ultimo_contato ? (
                        <>
                          último contato{' '}
                          <span className="valor">{formatarDataHora(d.ultimo_contato)}</span>
                        </>
                      ) : (
                        'nunca enviou'
                      )}
                      {d.firmware_versao ? ` · firmware ${d.firmware_versao}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-13 text-apoio">Nenhum dispositivo desta fonte.</span>
            )}
            {janela && Object.keys(janela.canais).length > 0 ? (
              <Canais janela={janela} velho={velho} />
            ) : null}
          </div>
        </Modulo>

        {pontosAtivos.map((ponto, indice) => (
          <ViewTransition
            key={ponto.id}
            name={`ponto-${ponto.codigo}`}
            share="modulo-ponto"
            default="none"
          >
            <div className="flex min-w-0 bg-modulo xl:col-span-4">
              <ModuloDoPonto
                maquinaId={maquinaId}
                ponto={ponto}
                indice={indice}
                janela={janela}
                recentes={aoVivo.recentes}
                simulado={aoVivo.simulado && !semNenhumDado}
                frescor={frescor}
                idadeS={idadeS}
              />
            </div>
          </ViewTransition>
        ))}

        <SecaoDoMapa
          maquinaId={maquinaId}
          simulado={aoVivo.simulado}
          periodo={periodoDoMapa}
          codigos={pontosAtivos.map((p) => p.codigo)}
        />
      </Painel>
    </div>
  )
}

function LinkDoPonto({ maquinaId, ponto }: { maquinaId: number; ponto: Ponto }) {
  return (
    <Link
      to="/maquinas/$maquinaId/pontos/$codigo"
      params={{ maquinaId, codigo: ponto.codigo }}
      aria-label={`Abrir o ponto ${ponto.codigo}: ${rotuloDoPapel(ponto.papel)}`}
      className="flex size-11 items-center justify-center rounded-full"
    >
      <MarcadorPonto codigo={ponto.codigo} />
    </Link>
  )
}

function marcadoresDoTorno(maquinaId: number, pontos: Ponto[]): MarcadorNoTorno[] {
  return [
    ...pontos.map((ponto) => ({
      codigo: ponto.codigo,
      papel: rotuloDoPapel(ponto.papel),
      conteudo: <LinkDoPonto maquinaId={maquinaId} ponto={ponto} />,
    })),
    {
      codigo: 'R',
      papel: 'rotação',
      conteudo: (
        <span className="flex size-11 items-center justify-center">
          <MarcadorPonto codigo="R" tamanho="pequeno" />
        </span>
      ),
    },
  ]
}

function QualidadeDaJanela({
  janela,
  velho,
  frescor,
  idadeS,
}: {
  janela: Janela | undefined
  velho: boolean
  frescor: Frescor
  idadeS: number | null
}) {
  if (!janela) return <span className="text-13 text-apoio">Sem janela recebida.</span>
  const completude = fracao(janela.amostras, janela.amostras_esperadas)
  return (
    <div
      className="grid grid-cols-2 gap-x-3 gap-y-2 @min-[26rem]:grid-cols-4"
      data-velho={velho || undefined}
    >
      <Leitura
        rotulo="Amostras"
        valor={completude === null ? TRACO : formatarPercentual(completude, 1)}
        tamanho="pequeno"
        velho={velho}
      />
      <Leitura
        rotulo="Lidas / esperadas"
        valor={`${formatarNumero(janela.amostras)} / ${formatarNumero(janela.amostras_esperadas)}`}
        tamanho="pequeno"
        velho={velho}
      />
      <Leitura
        rotulo="Saturação"
        valor={janela.saturou ? 'saturou' : 'não'}
        tamanho="pequeno"
        velho={velho}
      />
      <Leitura
        rotulo="Modo"
        valor={janela.modo === 'rapido' ? 'rápido 1 s' : 'normal 5 s'}
        tamanho="pequeno"
        velho={velho}
      />
      <div className="col-span-full flex flex-wrap items-center gap-x-2 text-12 text-apoio">
        <span>
          medida às <span className="valor">{formatarHora(janela.medido_em)}</span>
        </span>
        <MarcaDeIdade frescor={frescor} idadeS={idadeS} />
      </div>
    </div>
  )
}

function Canais({ janela, velho }: { janela: Janela; velho: boolean }) {
  return (
    <div className="border-t border-linha pt-2 @min-[34rem]:border-t-0 @min-[34rem]:border-l @min-[34rem]:pt-0 @min-[34rem]:pl-6">
      <span className="rotulo">Canais</span>
      <dl
        className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5"
        data-velho={velho || undefined}
      >
        {Object.entries(janela.canais).map(([codigo, canal]) => (
          <div key={codigo} className="contents">
            <dt
              className="valor truncate text-12 text-apoio"
              title={`${codigo} (${canal.grandeza})`}
            >
              {codigo}
            </dt>
            <dd className="text-right">
              <span className="valor text-13 font-medium text-texto">
                {formatarNumero(canal.valor, 1)}
              </span>{' '}
              <span className="text-12 text-apoio">{canal.unidade}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

type PropsDoModuloDoPonto = {
  maquinaId: number
  ponto: Ponto
  indice: number
  janela: Janela | undefined
  recentes: Janela[]
  simulado: boolean
  frescor: Frescor
  idadeS: number | null
}

function ModuloDoPonto({
  maquinaId,
  ponto,
  indice,
  janela,
  recentes,
  simulado,
  frescor,
  idadeS,
}: PropsDoModuloDoPonto) {
  const medida = janela?.pontos[ponto.codigo]
  const velho = frescor !== 'vivo'
  const traco = tracoDoPonto(indice)
  const tendencia = useMemo(
    () =>
      recentes.filter((j) => j.modo === 'normal').map((j) => j.pontos[ponto.codigo]?.rms_g ?? null),
    [recentes, ponto.codigo],
  )

  return (
    <Modulo
      rotulo={`Ponto ${ponto.codigo}`}
      detalhe={`${rotuloDoPapel(ponto.papel)} · ${ponto.descricao}`}
      simulado={simulado}
      className="flex-1"
      acoes={
        <>
          {velho && janela ? <MarcaDeIdade frescor={frescor} idadeS={idadeS} /> : null}
          <Link
            to="/maquinas/$maquinaId/pontos/$codigo"
            params={{ maquinaId, codigo: ponto.codigo }}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Abrir ponto {ponto.codigo}
            <ArrowRight aria-hidden="true" strokeWidth={1.5} />
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <MarcadorPonto codigo={ponto.codigo} className="mt-1" />
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-x-3 gap-y-2">
            <Leitura
              rotulo="RMS"
              valor={formatarG(medida?.rms_g)}
              unidade="g"
              tamanho="grande"
              velho={velho}
            />
            <Leitura rotulo="Pico" valor={formatarG(medida?.pico_g)} unidade="g" velho={velho} />
            <Leitura rotulo="Curt" valor={formatarCurtose(medida?.curtose)} velho={velho} />
            <Leitura rotulo="1X" valor={formatarG(medida?.o1x)} unidade="g" velho={velho} />
            <Leitura rotulo="2X" valor={formatarG(medida?.o2x)} unidade="g" velho={velho} />
            <Leitura rotulo="3X" valor={formatarG(medida?.o3x)} unidade="g" velho={velho} />
          </div>
        </div>
        {janela && !medida ? (
          <p className="border border-dashed border-linha-forte px-2 py-1 text-12 text-texto">
            A última janela não trouxe o ponto {ponto.codigo}.
          </p>
        ) : null}
        <div className="grid grid-cols-1 items-end gap-3 @min-[26rem]:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <span className="rotulo">Desvio do RMS</span>
            <ReguaDesvio valor={medida?.rms_g} referencia={null} velho={velho} className="mt-1" />
          </div>
          <div>
            <span className="rotulo">RMS · 15 min</span>
            <div className="mt-1">
              <Sparkline
                valores={tendencia}
                tracejado={traco.tracejado}
                cor={traco.variavel}
                velho={velho}
                largura={120}
                altura={28}
                descricao={`RMS do ponto ${ponto.codigo} nos últimos 15 minutos`}
              />
            </div>
          </div>
        </div>
      </div>
    </Modulo>
  )
}

type PropsDoMapa = {
  maquinaId: number
  simulado: boolean
  periodo: PeriodoMapa['chave']
  codigos: string[]
}

function SecaoDoMapa({ maquinaId, simulado, periodo, codigos }: PropsDoMapa) {
  const navegar = useNavigate({ from: '/maquinas/$maquinaId/' })
  const escolhido = PERIODOS_MAPA.find((p) => p.chave === periodo) ?? PERIODO_MAPA_PADRAO
  const serie = useQuery({
    ...consultaSerieRecente(maquinaId, simulado, escolhido.segundos, escolhido.baldes),
    refetchInterval: Math.max(15_000, (escolhido.segundos / escolhido.baldes) * 1000),
    placeholderData: (anterior) => anterior,
  })

  const { intervalos, linhas } = useMemo(() => {
    const dados = serie.data
    if (!dados) return { intervalos: [] as IntervaloDoMapa[], linhas: [] as LinhaDoMapa[] }
    const pontos = ordenarCodigos(codigos.length > 0 ? codigos : dados.pontos)
    const grandezas = [
      { rotulo: 'RMS', chave: 'rms_media_g' },
      { rotulo: '1X', chave: 'o1x_media' },
      { rotulo: '2X', chave: 'o2x_media' },
      { rotulo: '3X', chave: 'o3x_media' },
    ] as const
    return {
      intervalos: dados.intervalos.map((i) => ({
        inicio: i.inicio,
        fim: i.fim,
        janelas: i.janelas,
        saturou: i.saturou,
        rotacaoRpm: i.rotacao_media_rpm,
      })),
      linhas: pontos.flatMap((ponto) =>
        grandezas.map((g) => ({
          chave: `${ponto}-${g.rotulo}`,
          ponto,
          grandeza: g.rotulo,
          valores: dados.intervalos.map((i) => i.pontos[ponto]?.[g.chave] ?? null),
          // A referência (faixa normal) ainda não existe na API: o mapa fica em cinza
          referencia: null,
        })),
      ),
    }
  }, [serie.data, codigos])

  const temDado = intervalos.some((i) => i.janelas > 0)

  return (
    <Modulo
      rotulo="Mapa de ordens"
      detalhe="amplitude por intervalo de tempo, média de cada intervalo"
      simulado={simulado && temDado}
      className="xl:col-span-12"
      acoes={
        <ToggleGroup
          aria-label="Período do mapa de ordens"
          value={[escolhido.chave]}
          onValueChange={(valores) => {
            const novo = PERIODOS_MAPA.find((p) => p.chave === valores[0])
            if (novo)
              void navegar({ search: { mapa: novo.chave }, replace: true, resetScroll: false })
          }}
        >
          {PERIODOS_MAPA.map((p) => (
            <ToggleGroupItem key={p.chave} value={p.chave} size="sm">
              {p.rotulo}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      {serie.isPending ? (
        <EstadoCarregando rotulo="Carregando o mapa…" />
      ) : serie.isError ? (
        <EstadoErro erro={serie.error} aoTentarDeNovo={() => void serie.refetch()} />
      ) : !temDado ? (
        <EstadoVazio titulo={`Nenhuma janela ${simulado ? 'simulada' : 'real'} neste período.`}>
          O mapa mostra a amplitude de cada ponto ao longo do tempo assim que houver janelas.
        </EstadoVazio>
      ) : (
        <MapaOrdens intervalos={intervalos} linhas={linhas} simulado={simulado} />
      )}
    </Modulo>
  )
}

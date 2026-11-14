import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'

import {
  INTERVALO_DE_CONSULTA_MS,
  consultaDispositivos,
  consultaMaquinas,
  consultaPontos,
  consultaSerieRecente,
  consultaUltimaJanela,
  type UltimaObservada,
} from '@/api/consultas'
import type { Maquina } from '@/api/tipos'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { MarcaDeIdade } from '@/componentes/instrumento/Idade'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { PlacaEstado, SeloAvaliacao } from '@/componentes/instrumento/Selos'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Sparkline } from '@/componentes/instrumento/Sparkline'
import { Button } from '@/componentes/ui/button'
import { estadoDaMaquina } from '@/dominio/estado'
import { formatarDataHora, formatarG, formatarRpm, TRACO } from '@/dominio/formato'
import { SPARKLINE_BALDES, SPARKLINE_SEGUNDOS } from '@/dominio/periodos'
import { ultimoContato } from '@/dominio/maquina'
import { ordenarCodigos } from '@/dominio/pontos'
import { definirFonte, useFonte } from '@/estado/preferencias'
import { definirTransporte, definirUltimaObservacao } from '@/estado/transporte'
import { useFrescorDaMaquina } from '@/hooks/useFrescorDaMaquina'
import { cn } from '@/lib/utils'

/** Colunas da linha de máquina quando o módulo é largo; abaixo disso as células se empilham. */
const COLUNAS =
  '@min-[84rem]:grid-cols-[minmax(11rem,1.3fr)_13rem_6.5rem_repeat(3,minmax(10.5rem,1fr))_10.5rem_minmax(9rem,1fr)_minmax(10rem,1fr)]'

const CABECALHOS = [
  'Máquina',
  'Estado',
  'Rotação',
  'RMS · 15 min',
  '',
  '',
  'Avaliação',
  'Ensaio',
  'Dispositivo',
]

/**
 * L1 — Visão geral. Uma linha por máquina (não cartões): código, estado, rotação, RMS de cada
 * ponto com a tendência dos últimos 15 min, avaliação, ensaio aberto e dispositivo.
 */
export function TelaVisaoGeral() {
  const fonte = useFonte()
  const simulado = fonte === 'simulado'
  const maquinas = useQuery(consultaMaquinas())
  const lista = useMemo(() => maquinas.data?.conteudo ?? [], [maquinas.data])

  const ultimas = useQueries({
    queries: lista.map((maquina) => ({
      ...consultaUltimaJanela(maquina.id, simulado),
      refetchInterval: INTERVALO_DE_CONSULTA_MS,
    })),
  })

  // a barra superior mostra a idade da janela mais recente entre as máquinas
  const maisRecente = useMemo(() => {
    let melhor: NonNullable<UltimaObservada>['observacao'] | null = null
    for (const ultima of ultimas) {
      const observacao = ultima.data?.observacao
      if (!observacao) continue
      const chegada = observacao.observadoEmMs - observacao.idadeNaObservacaoS * 1000
      if (!melhor || chegada > melhor.observadoEmMs - melhor.idadeNaObservacaoS * 1000)
        melhor = observacao
    }
    return melhor
  }, [ultimas])

  useEffect(() => {
    document.title = 'Visão geral · PredictSpin'
    definirTransporte('consulta')
    return () => definirTransporte('inativo')
  }, [])
  useEffect(() => {
    definirUltimaObservacao(maisRecente)
    return () => definirUltimaObservacao(null)
  }, [maisRecente])

  const carregouUltimas = ultimas.length > 0 && ultimas.every((u) => u.isSuccess)
  const semMedicaoReal = !simulado && carregouUltimas && ultimas.every((u) => u.data === null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-18 font-semibold">Visão geral</h1>
        {maquinas.data ? (
          <p className="text-13 text-apoio">
            <span className="valor text-texto">{maquinas.data.total_elementos}</span>{' '}
            {maquinas.data.total_elementos === 1 ? 'máquina' : 'máquinas'}
            {maquinas.data.total_elementos > maquinas.data.conteudo.length ? (
              <> · mostrando as primeiras {maquinas.data.conteudo.length}</>
            ) : null}
          </p>
        ) : null}
      </div>

      {semMedicaoReal ? (
        <Painel>
          <Modulo rotulo="Medição real" semRecuo>
            <EstadoVazio
              titulo="Nenhuma medição real recebida."
              acao={<Button onClick={() => definirFonte('simulado')}>Ver dados simulados</Button>}
            >
              O dispositivo do torno ainda não enviou janelas. Os dados simulados servem para
              conhecer o painel e nunca substituem medição.
            </EstadoVazio>
          </Modulo>
        </Painel>
      ) : null}

      <Painel>
        <Modulo rotulo="Máquinas" simulado={simulado} semRecuo>
          {maquinas.isPending ? (
            <EstadoCarregando rotulo="Carregando máquinas…" />
          ) : maquinas.isError ? (
            <EstadoErro erro={maquinas.error} aoTentarDeNovo={() => void maquinas.refetch()} />
          ) : lista.length === 0 ? (
            <EstadoVazio titulo="Nenhuma máquina cadastrada.">
              As máquinas são cadastradas na API. Quando houver uma, ela aparece aqui.
            </EstadoVazio>
          ) : (
            <div role="table" aria-label="Máquinas">
              <div
                role="row"
                className={cn(
                  'hidden gap-x-4 border-b border-linha px-3 py-1 @min-[84rem]:grid',
                  COLUNAS,
                )}
              >
                {CABECALHOS.map((titulo, i) => (
                  <span key={i} role="columnheader" className="rotulo">
                    {titulo}
                  </span>
                ))}
              </div>
              {lista.map((maquina, i) => (
                <LinhaDaMaquina
                  key={maquina.id}
                  maquina={maquina}
                  simulado={simulado}
                  ultima={ultimas[i]?.data}
                  carregando={ultimas[i]?.isPending ?? true}
                />
              ))}
            </div>
          )}
        </Modulo>
      </Painel>
    </div>
  )
}

type PropsDaLinha = {
  maquina: Maquina
  simulado: boolean
  ultima: UltimaObservada | undefined
  carregando: boolean
}

function LinhaDaMaquina({ maquina, simulado, ultima, carregando }: PropsDaLinha) {
  const pontos = useQuery(consultaPontos(maquina.id))
  const serie = useQuery({
    ...consultaSerieRecente(maquina.id, simulado, SPARKLINE_SEGUNDOS, SPARKLINE_BALDES),
    refetchInterval: 30_000,
  })
  const dispositivos = useQuery(consultaDispositivos(maquina.id, simulado))
  const { frescor, idadeS, velho } = useFrescorDaMaquina(ultima)

  const janela = ultima?.janela
  const estado = estadoDaMaquina(frescor, janela?.rotacao_rpm)
  const codigos = ordenarCodigos(
    pontos.data?.filter((p) => p.ativo).map((p) => p.codigo) ?? Object.keys(janela?.pontos ?? {}),
  ).slice(0, 3)
  const dispositivo = dispositivos.data?.[0]
  const contato = dispositivo
    ? ultimoContato(dispositivo.ultimo_contato, janela, dispositivo.identificador)
    : null

  return (
    <div
      role="row"
      data-velho={velho || undefined}
      data-estado={estado}
      className={cn(
        'relative grid grid-cols-2 items-center gap-x-4 gap-y-3 border-b border-linha px-3 py-2 last:border-b-0 @min-[40rem]:grid-cols-3',
        '[@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce',
        COLUNAS,
      )}
    >
      <div
        role="cell"
        className="col-span-2 min-w-0 @min-[40rem]:col-span-3 @min-[84rem]:col-span-1"
      >
        <Link
          to="/maquinas/$maquinaId"
          params={{ maquinaId: maquina.id }}
          className="valor block truncate text-15 font-semibold text-texto underline-offset-4 after:absolute after:inset-0 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
          title={maquina.codigo}
        >
          {maquina.codigo}
        </Link>
        <p
          className="truncate text-12 text-apoio"
          title={`${maquina.modelo} · ${maquina.local.nome}`}
        >
          {maquina.modelo} · {maquina.local.nome} ({maquina.local.uf})
        </p>
      </div>

      <Celula rotulo="Estado" className="col-span-2 @min-[40rem]:col-span-1">
        {carregando ? (
          <span className="text-12 text-apoio">carregando…</span>
        ) : (
          <PlacaEstado estado={estado} />
        )}
        {frescor !== 'vivo' && !carregando ? (
          <MarcaDeIdade frescor={frescor} idadeS={idadeS} className="mt-1" />
        ) : null}
      </Celula>

      <Celula rotulo="Rotação">
        <span className="flex items-baseline gap-1">
          <span className="valor text-18 font-medium text-texto">
            {formatarRpm(janela?.rotacao_rpm)}
          </span>
          <span className="text-12 text-apoio">rpm</span>
        </span>
      </Celula>

      {[0, 1, 2].map((indice) => {
        const codigo = codigos[indice]
        return (
          <Celula key={indice} rotulo={codigo ? `RMS ${codigo}` : 'RMS'}>
            {codigo ? (
              <span className="flex items-center gap-2">
                <span className="valor w-4 text-13 font-semibold text-texto @max-[84rem]:hidden">
                  {codigo}
                </span>
                <span className="flex items-baseline gap-1">
                  <span className="valor text-15 font-medium text-texto">
                    {formatarG(janela?.pontos[codigo]?.rms_g)}
                  </span>
                  <span className="text-12 text-apoio">g</span>
                </span>
                <Sparkline
                  valores={
                    serie.data?.intervalos.map(
                      (intervalo) => intervalo.pontos[codigo]?.rms_media_g ?? null,
                    ) ?? []
                  }
                  velho={velho}
                  largura={88}
                  altura={22}
                  descricao={`RMS do ponto ${codigo} nos últimos 15 minutos`}
                />
              </span>
            ) : (
              <span className="text-fraco">{TRACO}</span>
            )}
          </Celula>
        )
      })}

      <Celula rotulo="Avaliação">
        <SeloAvaliacao avaliacao="sem_referencia" />
      </Celula>

      <Celula rotulo="Ensaio">
        {janela?.ensaio_codigo && !velho ? (
          <span className="valor block truncate text-13 text-texto" title={janela.ensaio_codigo}>
            {janela.ensaio_codigo}
          </span>
        ) : (
          <span className="text-13 text-apoio">nenhum aberto</span>
        )}
      </Celula>

      <Celula rotulo="Dispositivo" className="col-span-2 @min-[40rem]:col-span-1">
        {dispositivo ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="valor truncate text-13 text-texto" title={dispositivo.identificador}>
                {dispositivo.identificador}
              </span>
              {dispositivo.simulado ? <SeloSim /> : null}
            </span>
            <span className="block text-12 text-apoio">
              {contato ? (
                <>
                  último contato <span className="valor">{formatarDataHora(contato)}</span>
                </>
              ) : (
                'nunca enviou'
              )}
            </span>
          </>
        ) : (
          <span className="text-13 text-apoio">
            {dispositivos.isPending ? 'carregando…' : 'nenhum cadastrado'}
          </span>
        )}
      </Celula>
    </div>
  )
}

function Celula({
  rotulo,
  className,
  children,
}: {
  rotulo: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div role="cell" className={cn('min-w-0', className)}>
      <span className="rotulo block @min-[84rem]:hidden">{rotulo}</span>
      {children}
    </div>
  )
}

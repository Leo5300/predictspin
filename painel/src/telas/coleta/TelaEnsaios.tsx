import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  consultaAlteracoes,
  consultaCatalogo,
  consultaEventosMarcados,
  consultaListaDeEnsaios,
  corrigirReceita,
  descartarEnsaio,
  ENSAIOS_POR_PAGINA,
  type AlteracaoEnsaio,
} from '@/api/coleta'
import { ErroApi, mensagemDoErro } from '@/api/erros'
import type { Ensaio } from '@/api/tipos'
import { CampoCatalogo, CampoNumero } from '@/componentes/coleta/CamposReceita'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SegurarParaConfirmar } from '@/componentes/instrumento/SegurarParaConfirmar'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Button, buttonVariants } from '@/componentes/ui/button'
import { CONDICOES, ETAPAS, ROTULO_CONDICAO, type Condicao, type Etapa } from '@/dominio/coleta'
import { formatarDataHora, formatarNumero } from '@/dominio/formato'
import {
  lerDecimal,
  receitaDoEnsaio,
  resumoDaReceita,
  ROTULO_FLUIDO,
  validarReceita,
  type ErrosDaReceita,
  type Fluido,
  type Receita,
} from '@/dominio/receita'
import { useFonte } from '@/estado/preferencias'
import { useMaquinaDaColeta } from '@/hooks/useMaquinaDaColeta'
import { cn } from '@/lib/utils'
import type { BuscaDosEnsaios } from '@/rotas/_painel/coleta.ensaios.index'

import { CabecalhoDaColeta } from './TelaColeta'

const MOTIVO: Record<string, string> = {
  pancada: 'pancada',
  cavaco: 'cavaco',
  maquina_vizinha: 'máquina vizinha',
  outro: 'outro',
}

const CAMPO: Record<string, string> = {
  material: 'Material',
  ferramenta: 'Ferramenta',
  avanco_alvo: 'Avanço (mm/volta)',
  profundidade_corte_mm: 'Profundidade (mm)',
  diametro_peca_mm: 'Diâmetro (mm)',
  fluido_corte: 'Fluido',
  observacao: 'Observação',
}

export function TelaEnsaios({ busca }: { busca: BuscaDosEnsaios }) {
  const { maquinas, id } = useMaquinaDaColeta(busca.maquina)
  useEffect(() => {
    document.title = 'Ensaios · PredictSpin'
  }, [])
  if (maquinas.isPending) return <EstadoCarregando />
  if (maquinas.isError) return <EstadoErro erro={maquinas.error} />
  if (id === undefined) return <EstadoErro erro={new Error('Nenhuma máquina cadastrada.')} />
  return (
    <ListaDeEnsaios
      maquinaId={id}
      busca={busca}
      codigo={maquinas.data.conteudo.find((m) => m.id === id)?.codigo ?? ''}
    />
  )
}

function ListaDeEnsaios({
  maquinaId,
  busca,
  codigo,
}: {
  maquinaId: number
  busca: BuscaDosEnsaios
  codigo: string
}) {
  const simulado = useFonte() === 'simulado'
  const navegar = useNavigate({ from: '/coleta/ensaios/' })
  const lista = useQuery(
    consultaListaDeEnsaios(maquinaId, {
      simulado,
      etapa: busca.etapa as Etapa | undefined,
      condicao: busca.condicao as Condicao | undefined,
      material_id: busca.material,
      ferramenta_id: busca.ferramenta,
      aberto: busca.estado === 'abertos' ? true : busca.estado === 'encerrados' ? false : undefined,
      descartado:
        busca.estado === 'descartados' ? true : busca.estado === 'encerrados' ? false : undefined,
      pagina: busca.pagina,
    }),
  )
  const materiais = useQuery(consultaCatalogo('materiais', '', null))
  const ferramentas = useQuery(consultaCatalogo('ferramentas', '', null))
  const mudar = (parte: Partial<BuscaDosEnsaios>) =>
    void navegar({ search: (b) => ({ ...b, ...parte, pagina: parte.pagina ?? 0 }), replace: true })

  const pagina = lista.data
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Caminho" className="text-12 text-apoio">
        <Link to="/coleta" search={{ maquina: maquinaId }} className="underline underline-offset-2">
          Coleta
        </Link>{' '}
        / <span aria-current="page">Ensaios</span>
      </nav>
      <CabecalhoDaColeta codigo={codigo} maquinaId={maquinaId} titulo="Ensaios gravados" naLista />
      <Painel>
        <Modulo rotulo="Filtros">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Seletor
              rotulo="Etapa"
              valor={busca.etapa ?? ''}
              opcoes={[['', 'todas'], ...ETAPAS.map((e) => [e, e] as [string, string])]}
              aoMudar={(v) => mudar({ etapa: v || undefined })}
            />
            <Seletor
              rotulo="Condição"
              valor={busca.condicao ?? ''}
              opcoes={[
                ['', 'todas'],
                ...CONDICOES.map((c) => [c, ROTULO_CONDICAO[c]] as [string, string]),
              ]}
              aoMudar={(v) => mudar({ condicao: v || undefined })}
            />
            <Seletor
              rotulo="Material"
              valor={busca.material ? String(busca.material) : ''}
              opcoes={[
                ['', 'todos'],
                ...(materiais.data?.conteudo ?? []).map(
                  (m) => [String(m.id), m.nome] as [string, string],
                ),
              ]}
              aoMudar={(v) => mudar({ material: v ? Number(v) : undefined })}
            />
            <Seletor
              rotulo="Ferramenta"
              valor={busca.ferramenta ? String(busca.ferramenta) : ''}
              opcoes={[
                ['', 'todas'],
                ...(ferramentas.data?.conteudo ?? []).map(
                  (m) => [String(m.id), m.nome] as [string, string],
                ),
              ]}
              aoMudar={(v) => mudar({ ferramenta: v ? Number(v) : undefined })}
            />
            <Seletor
              rotulo="Situação"
              valor={busca.estado}
              opcoes={[
                ['todos', 'todos'],
                ['abertos', 'abertos'],
                ['encerrados', 'encerrados (válidos)'],
                ['descartados', 'descartados'],
              ]}
              aoMudar={(v) => mudar({ estado: v as BuscaDosEnsaios['estado'] })}
            />
          </div>
        </Modulo>
        <Modulo
          rotulo="Ensaios"
          simulado={simulado}
          detalhe={
            pagina ? (
              <>
                <span className="valor text-texto">{formatarNumero(pagina.total_elementos)}</span>{' '}
                {pagina.total_elementos === 1 ? 'ensaio' : 'ensaios'}{' '}
                {simulado ? 'simulados' : 'reais'}
              </>
            ) : undefined
          }
          semRecuo
        >
          {lista.isPending ? (
            <EstadoCarregando />
          ) : lista.isError ? (
            <EstadoErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />
          ) : pagina?.conteudo.length === 0 ? (
            <EstadoVazio
              titulo={`Nenhum ensaio ${simulado ? 'simulado' : 'real'} com estes filtros.`}
            >
              Grave pela Coleta; cada gravação vira um ensaio aqui.
            </EstadoVazio>
          ) : pagina ? (
            <ul className="flex flex-col" data-testid="lista-ensaios">
              {pagina.conteudo.map((e) => (
                <LinhaDoEnsaio
                  key={e.id}
                  ensaio={e}
                  aberto={busca.ensaio === e.id}
                  aoAlternar={() =>
                    void navegar({
                      search: (b) => ({ ...b, ensaio: b.ensaio === e.id ? undefined : e.id }),
                      replace: true,
                      resetScroll: false,
                    })
                  }
                />
              ))}
            </ul>
          ) : null}
          {pagina && pagina.total_paginas > 1 ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-linha px-3 py-2 text-13">
              <span className="text-apoio">
                {busca.pagina * ENSAIOS_POR_PAGINA + 1}–
                {Math.min((busca.pagina + 1) * ENSAIOS_POR_PAGINA, pagina.total_elementos)} de{' '}
                {pagina.total_elementos}
              </span>
              <span className="ml-auto flex gap-2">
                <Button
                  disabled={busca.pagina === 0}
                  onClick={() => mudar({ pagina: busca.pagina - 1 })}
                >
                  <ChevronLeft aria-hidden="true" strokeWidth={1.5} /> Mais recentes
                </Button>
                <Button
                  disabled={busca.pagina + 1 >= pagina.total_paginas}
                  onClick={() => mudar({ pagina: busca.pagina + 1 })}
                >
                  Mais antigos <ChevronRight aria-hidden="true" strokeWidth={1.5} />
                </Button>
              </span>
            </div>
          ) : null}
        </Modulo>
      </Painel>
    </div>
  )
}

function Seletor({
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: {
  rotulo: string
  valor: string
  opcoes: [string, string][]
  aoMudar: (v: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="rotulo">{rotulo}</span>
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="min-h-11 w-full min-w-0 truncate rounded-2 border border-linha-forte bg-rebaixo px-2 text-15 text-texto"
      >
        {opcoes.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  )
}

function situacao(e: Ensaio): string {
  if (e.descartado) return 'descartado'
  if (e.aberto) return 'gravando'
  return 'encerrado'
}

function LinhaDoEnsaio({
  ensaio,
  aberto,
  aoAlternar,
}: {
  ensaio: Ensaio
  aberto: boolean
  aoAlternar: () => void
}) {
  const receita = resumoDaReceita(receitaDoEnsaio(ensaio))
  return (
    <li className="border-b border-linha last:border-b-0" data-ensaio={ensaio.codigo}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
        <button
          type="button"
          onClick={aoAlternar}
          aria-expanded={aberto}
          className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-left"
        >
          <span aria-hidden="true" className={cn('text-12 text-apoio', aberto && 'rotate-90')}>
            ▸
          </span>
          <span className="valor text-15 font-semibold text-texto">{ensaio.codigo}</span>
          <span className="text-13 text-texto">
            <span className="valor">{ensaio.etapa}</span> · {ROTULO_CONDICAO[ensaio.condicao]} ·{' '}
            <span className="valor">{ensaio.rotacao_alvo_rpm}</span> rpm · rep.{' '}
            <span className="valor">{ensaio.repeticao}</span>
          </span>
          <span className="text-13 text-apoio">{formatarDataHora(ensaio.iniciado_em)}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 border px-1.5 text-12 uppercase tracking-[0.06em]',
              ensaio.descartado
                ? 'border-dashed border-linha-forte text-apoio line-through'
                : ensaio.aberto
                  ? 'border-texto text-texto'
                  : 'border-linha-forte text-texto',
            )}
          >
            {situacao(ensaio)}
          </span>
          {ensaio.simulado ? <SeloSim /> : null}
          {receita.length > 0 ? (
            <span className="min-w-0 basis-full truncate text-12 text-apoio sm:basis-auto">
              {receita.map((l) => l.valor).join(' · ')}
            </span>
          ) : null}
        </button>
        <Link
          to="/coleta/ensaios/$ensaioId/replay"
          params={{ ensaioId: ensaio.id }}
          className={buttonVariants({ variant: 'outline' })}
          aria-label={`Replay do ensaio ${ensaio.codigo}`}
        >
          <Play aria-hidden="true" strokeWidth={1.5} /> Replay
        </Link>
      </div>
      {aberto ? <DetalheDoEnsaio ensaio={ensaio} /> : null}
    </li>
  )
}

function DetalheDoEnsaio({ ensaio }: { ensaio: Ensaio }) {
  const cliente = useQueryClient()
  const eventos = useQuery(consultaEventosMarcados(ensaio.id))
  const alteracoes = useQuery(consultaAlteracoes(ensaio.id))
  const [corrigindo, setCorrigindo] = useState(false)
  return (
    <div className="grid gap-4 border-t border-linha bg-rebaixo px-3 py-3 lg:grid-cols-3">
      <div className="flex flex-col gap-2">
        <span className="rotulo">Receita</span>
        {corrigindo ? (
          <CorrecaoDaReceita
            ensaio={ensaio}
            aoTerminar={() => {
              setCorrigindo(false)
              void cliente.invalidateQueries({ queryKey: ['ensaios-lista'] })
              void cliente.invalidateQueries({ queryKey: ['ensaio-alteracoes', ensaio.id] })
            }}
          />
        ) : (
          <>
            <TabelaDaReceita ensaio={ensaio} />
            {ensaio.observacao ? (
              <p className="text-13 text-texto">
                <span className="text-apoio">Observação: </span>
                {ensaio.observacao}
              </p>
            ) : null}
            <Button className="self-start" onClick={() => setCorrigindo(true)}>
              Corrigir receita
            </Button>
          </>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="rotulo">Eventos marcados</span>
        {eventos.isPending ? (
          <span className="text-13 text-apoio">Carregando…</span>
        ) : (eventos.data ?? []).length === 0 ? (
          <span className="text-13 text-apoio">Nenhum evento marcado.</span>
        ) : (
          <ul className="flex flex-col gap-1 text-13">
            {(eventos.data ?? []).map((ev) => (
              <li key={ev.id} className="text-texto">
                <span className="valor">{formatarDataHora(ev.ocorrido_em)}</span> ·{' '}
                {MOTIVO[ev.motivo] ?? ev.motivo}
                {ev.nota ? <span className="text-apoio"> · {ev.nota}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <span className="text-12 text-apoio">
          As janelas com evento (e a seguinte) saem marcadas no CSV, fora do treino.
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="rotulo">Histórico de correções</span>
        <Historico alteracoes={alteracoes.data} carregando={alteracoes.isPending} />
        {!ensaio.descartado ? (
          <SegurarParaConfirmar
            className="mt-2 self-start"
            aoConfirmar={() => {
              descartarEnsaio(ensaio.id)
                .then(() => {
                  toast(`Ensaio ${ensaio.codigo} descartado (marcado, não apagado).`)
                  void cliente.invalidateQueries({ queryKey: ['ensaios-lista'] })
                  void cliente.invalidateQueries({ queryKey: ['cobertura'] })
                })
                .catch((e: unknown) => toast(mensagemDoErro(e)))
            }}
          >
            Segure para descartar
          </SegurarParaConfirmar>
        ) : null}
      </div>
    </div>
  )
}

function TabelaDaReceita({ ensaio }: { ensaio: Ensaio }) {
  const linhas = resumoDaReceita(receitaDoEnsaio(ensaio))
  if (linhas.length === 0) return <span className="text-13 text-apoio">Sem receita.</span>
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-13">
      {linhas.map((l) => (
        <div key={l.rotulo} className="contents">
          <dt className="text-apoio">{l.rotulo}</dt>
          <dd className="text-texto [overflow-wrap:anywhere]">{l.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Histórico de cada campo: valor antigo → novo, quem e quando. */
function Historico({
  alteracoes,
  carregando,
}: {
  alteracoes: AlteracaoEnsaio[] | undefined
  carregando: boolean
}) {
  if (carregando) return <span className="text-13 text-apoio">Carregando…</span>
  if (!alteracoes || alteracoes.length === 0)
    return <span className="text-13 text-apoio">Nenhuma correção: a receita é a da gravação.</span>
  return (
    <ol className="flex flex-col gap-1.5 text-13" data-testid="historico">
      {alteracoes.map((a) => (
        <li key={a.id} className="flex flex-col">
          <span className="text-texto">
            <span className="font-medium">{CAMPO[a.campo] ?? a.campo}</span>:{' '}
            <span className="text-apoio line-through">{textoDoValor(a.campo, a.valor_antigo)}</span>{' '}
            → <span>{textoDoValor(a.campo, a.valor_novo)}</span>
          </span>
          <span className="text-12 text-apoio">
            {a.alterado_por_nome ?? 'usuário removido'} ·{' '}
            <span className="valor">{formatarDataHora(a.alterado_em)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function textoDoValor(campo: string, valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return 'em branco'
  if (campo === 'fluido_corte')
    return (ROTULO_FLUIDO as Record<string, string | undefined>)[valor] ?? valor
  const numero = Number(valor)
  if (
    campo !== 'observacao' &&
    campo !== 'material' &&
    campo !== 'ferramenta' &&
    Number.isFinite(numero)
  )
    return numero.toLocaleString('pt-BR')
  return valor
}

/** Corrigir a receita: só os campos da receita e a observação; cada mudança vai para o histórico. */
function CorrecaoDaReceita({ ensaio, aoTerminar }: { ensaio: Ensaio; aoTerminar: () => void }) {
  const original = receitaDoEnsaio(ensaio)
  const [receita, setReceita] = useState<Receita>(original)
  const [observacao, setObservacao] = useState(ensaio.observacao ?? '')
  const [errosApi, setErrosApi] = useState<ErrosDaReceita>({})
  const [salvando, setSalvando] = useState(false)
  const erros = { ...validarReceita(receita), ...errosApi }

  const salvar = async () => {
    if (Object.keys(erros).length > 0) return
    // só o que mudou; null apaga o campo (o tipo gerado não diz que null é aceito, a API aceita)
    const corpo: Record<string, number | string | null> = {}
    const numero = (t: string) => {
      const v = lerDecimal(t)
      return v === null || Number.isNaN(v) ? null : v
    }
    if ((receita.material?.id ?? null) !== (original.material?.id ?? null))
      corpo.material_id = receita.material?.id ?? null
    if ((receita.ferramenta?.id ?? null) !== (original.ferramenta?.id ?? null))
      corpo.ferramenta_id = receita.ferramenta?.id ?? null
    if (numero(receita.avanco) !== numero(original.avanco))
      corpo.avanco_alvo = numero(receita.avanco)
    if (numero(receita.profundidade) !== numero(original.profundidade))
      corpo.profundidade_corte_mm = numero(receita.profundidade)
    if (numero(receita.diametro) !== numero(original.diametro))
      corpo.diametro_peca_mm = numero(receita.diametro)
    if (receita.fluido !== original.fluido) corpo.fluido_corte = receita.fluido
    if (observacao.trim() !== (ensaio.observacao ?? '')) corpo.observacao = observacao.trim()
    if (Object.keys(corpo).length === 0) {
      aoTerminar()
      return
    }
    setSalvando(true)
    try {
      await corrigirReceita(ensaio.id, corpo)
      toast('Receita corrigida; a mudança está no histórico.')
      aoTerminar()
    } catch (e) {
      if (e instanceof ErroApi && e.campos.length > 0) {
        const mapa: Record<string, keyof Receita> = {
          avanco_alvo: 'avanco',
          profundidade_corte_mm: 'profundidade',
          diametro_peca_mm: 'diametro',
        }
        const novos: ErrosDaReceita = {}
        e.campos.forEach((c) => {
          const campo = mapa[c.campo]
          if (campo) novos[campo] = c.mensagem
        })
        setErrosApi(novos)
      }
      toast(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="correcao-receita">
      <p className="text-12 text-apoio">
        Etapa, condição, rotação alvo e simulado não mudam: definem a célula da cobertura e a
        classe.
      </p>
      <CampoCatalogo
        tipo="materiais"
        rotulo="Material"
        valor={receita.material}
        aoMudar={(material) => setReceita((r) => ({ ...r, material }))}
      />
      <CampoCatalogo
        tipo="ferramentas"
        rotulo="Ferramenta"
        valor={receita.ferramenta}
        aoMudar={(ferramenta) => setReceita((r) => ({ ...r, ferramenta }))}
      />
      <CampoNumero
        nome="avanco"
        rotulo="Avanço"
        unidade="mm/volta"
        valor={receita.avanco}
        aoMudar={(avanco) => {
          setReceita((r) => ({ ...r, avanco }))
          setErrosApi({})
        }}
        erro={erros.avanco}
      />
      <CampoNumero
        nome="profundidade"
        rotulo="Profundidade de corte"
        unidade="mm"
        valor={receita.profundidade}
        aoMudar={(profundidade) => {
          setReceita((r) => ({ ...r, profundidade }))
          setErrosApi({})
        }}
        erro={erros.profundidade}
      />
      <CampoNumero
        nome="diametro"
        rotulo="Diâmetro da peça"
        unidade="mm"
        valor={receita.diametro}
        aoMudar={(diametro) => {
          setReceita((r) => ({ ...r, diametro }))
          setErrosApi({})
        }}
        erro={erros.diametro}
      />
      <label className="flex flex-col gap-1">
        <span className="rotulo">Fluido de corte</span>
        <select
          value={receita.fluido ?? ''}
          onChange={(e) =>
            setReceita((r) => ({ ...r, fluido: (e.target.value || null) as Fluido | null }))
          }
          className="min-h-11 rounded-2 border border-linha-forte bg-rebaixo px-2 text-15"
        >
          <option value="">em branco</option>
          {(Object.keys(ROTULO_FLUIDO) as Fluido[]).map((f) => (
            <option key={f} value={f}>
              {ROTULO_FLUIDO[f]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="rotulo">Observação</span>
        <textarea
          value={observacao}
          maxLength={2000}
          rows={2}
          onChange={(e) => setObservacao(e.target.value)}
          className="min-h-11 rounded-2 border border-linha-forte bg-rebaixo px-2.5 py-2 text-15"
        />
      </label>
      <div className="flex gap-2">
        <Button variant="default" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Gravando…' : 'Gravar correção'}
        </Button>
        <Button variant="ghost" onClick={aoTerminar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

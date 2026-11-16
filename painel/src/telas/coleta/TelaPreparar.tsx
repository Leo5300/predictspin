import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Info, RotateCcw } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { abrirEnsaio, consultaUltimoEnsaio, chavesColeta } from '@/api/coleta'
import { consultaPontos } from '@/api/consultas'
import { ErroApi, mensagemDoErro } from '@/api/erros'
import { CampoCatalogo, CampoNumero } from '@/componentes/coleta/CamposReceita'
import { BotaoRec, CartaoInstrucao } from '@/componentes/coleta/Gravador'
import { EstadoCarregando, EstadoErro } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Button, buttonVariants } from '@/componentes/ui/button'
import {
  chaveDaCelula,
  CONDICOES_DE_TREINO,
  DEFINICAO_ETAPA,
  ETAPAS,
  ROTULO_CONDICAO,
  ROTULO_ETAPA,
  repeticaoSugerida,
  rotacoesDoPlano,
  type Condicao,
  type Etapa,
} from '@/dominio/coleta'
import { bloqueado, preVoo, type ItemDoPreVoo } from '@/dominio/prevoo'
import {
  avisosDaReceita,
  FAIXAS,
  RECEITA_VAZIA,
  receitaDoEnsaio,
  receitaParaApi,
  ROTULO_FLUIDO,
  validarReceita,
  type ErrosDaReceita,
  type Fluido,
  type Receita,
} from '@/dominio/receita'
import { criarSessao, etapaAtual, pular, textoDaProxima } from '@/dominio/sessao'
import { definirSessaoDeColeta, useSessaoDeColeta } from '@/estado/coleta'
import { useFonte } from '@/estado/preferencias'
import { useColeta } from '@/hooks/useColeta'
import { useFrescorDaMaquina } from '@/hooks/useFrescorDaMaquina'
import { useMaquinaAoVivo } from '@/hooks/useMaquinaAoVivo'
import { useMaquinaDaColeta } from '@/hooks/useMaquinaDaColeta'
import { cn } from '@/lib/utils'
import type { BuscaDoPreparo } from '@/rotas/_painel/coleta.preparar'

type Passo = 1 | 2 | 3

export function TelaPreparar({ busca }: { busca: BuscaDoPreparo }) {
  const { maquinas, id } = useMaquinaDaColeta(busca.maquina)
  useEffect(() => {
    document.title = 'Preparar gravação · PredictSpin'
  }, [])
  if (maquinas.isPending) return <EstadoCarregando rotulo="Carregando…" />
  if (maquinas.isError) return <EstadoErro erro={maquinas.error} />
  if (id === undefined) return <EstadoErro erro={new Error('Nenhuma máquina cadastrada.')} />
  return <Preparo maquinaId={id} busca={busca} />
}

function Preparo({ maquinaId, busca }: { maquinaId: number; busca: BuscaDoPreparo }) {
  const simulado = useFonte() === 'simulado'
  const coleta = useColeta(maquinaId, simulado)
  const sessao = useSessaoDeColeta()
  const navegar = useNavigate()
  const cliente = useQueryClient()
  const sessaoAtiva =
    busca.sessao && sessao?.maquinaId === maquinaId && sessao.simulado === simulado ? sessao : null

  const planoOrdenado = rotacoesDoPlano(coleta.plano)
  const [etapa, setEtapa] = useState<Etapa>((busca.etapa as Etapa | undefined) ?? 'T1')
  const [condicao, setCondicao] = useState<Condicao>(
    (busca.condicao as Condicao | undefined) ?? 'normal',
  )
  const [rotacaoEscolhida, setRotacaoEscolhida] = useState<number | null>(
    busca.rotacao && busca.rotacao > 0 ? busca.rotacao : null,
  )
  const rotacaoPadrao = rotacaoEscolhida ?? planoOrdenado[0] ?? null
  const rotacao = etapa === 'T0' ? 0 : rotacaoPadrao
  const [receita, setReceita] = useState<Receita>(sessaoAtiva?.receita ?? RECEITA_VAZIA)
  const [observacao, setObservacao] = useState('')
  const [repeticaoDigitada, setRepeticaoDigitada] = useState<string>('')
  const [comSessao, setComSessao] = useState(false)
  const [comT0, setComT0] = useState(false)
  const [passo, setPasso] = useState<Passo>(1)
  const [errosApi, setErrosApi] = useState<ErrosDaReceita>({})
  const [abrindo, setAbrindo] = useState(false)
  const [conflito, setConflito] = useState<string | null>(null)

  const condicaoEfetiva: Condicao = etapa === 'T3' ? condicao : 'normal'
  const celula = coleta.grade.find(
    (c) =>
      chaveDaCelula(c) ===
      chaveDaCelula({ etapa, condicao: condicaoEfetiva, rotacao: rotacao ?? -1 }),
  )
  const repeticao = repeticaoDigitada === '' ? repeticaoSugerida(celula) : Number(repeticaoDigitada)

  const erros = { ...validarReceita(receita), ...errosApi }
  const avisos = avisosDaReceita(receita)
  const temErroDeReceita = Object.keys(erros).length > 0

  // pré-voo, a partir das janelas que estão chegando
  const aoVivo = useMaquinaAoVivo(maquinaId)
  const { frescor } = useFrescorDaMaquina(aoVivo.ultima, aoVivo.modoRapido)
  const pontos = useQuery(consultaPontos(maquinaId))
  const esperados = (pontos.data ?? [])
    .filter((p) => p.ativo)
    .map((p) => p.codigo)
    .sort()
  const itens = preVoo({
    janela: aoVivo.ultima?.janela,
    frescor,
    etapa,
    rotacaoAlvo: rotacao ?? 0,
    ensaioAberto: coleta.ensaioAberto.data?.codigo ?? null,
    simulado,
    pontosEsperados: esperados.length > 0 ? esperados : ['A', 'B', 'C'],
  })
  const travado = bloqueado(itens) || rotacao === null
  const motivoDoBloqueio =
    rotacao === null
      ? 'Escolha a rotação alvo.'
      : itens.find((i) => i.estado === 'bloqueia')?.oQueFazer

  const gravar = async () => {
    if (travado || abrindo) return
    if (temErroDeReceita) {
      setPasso(2)
      toast('Confira a receita: há um campo fora da faixa.')
      return
    }
    setAbrindo(true)
    setConflito(null)
    try {
      const ensaio = await abrirEnsaio(maquinaId, {
        etapa,
        condicao: condicaoEfetiva,
        rotacao_alvo_rpm: rotacao,
        repeticao: Number.isInteger(repeticao) && repeticao >= 1 ? repeticao : undefined,
        observacao: observacao.trim() || undefined,
        simulado,
        ...(etapa === 'T0' ? {} : receitaParaApi(receita)),
      })
      if (sessaoAtiva) {
        definirSessaoDeColeta({ ...sessaoAtiva, receita })
      } else if (comSessao && rotacaoPadrao !== null) {
        definirSessaoDeColeta(
          criarSessao({
            maquinaId,
            rotacao: rotacaoPadrao,
            comT0,
            condicaoT3: etapa === 'T3' ? condicao : 'normal',
            receita,
            simulado,
            agora: new Date(),
            desde: etapa,
          }),
        )
      }
      cliente.setQueryData(chavesColeta.ensaioAberto(maquinaId), ensaio)
      void navegar({ to: '/coleta', search: { maquina: maquinaId } })
    } catch (e) {
      if (e instanceof ErroApi && e.status === 409) {
        setConflito(e.message)
        void cliente.invalidateQueries({ queryKey: chavesColeta.ensaioAberto(maquinaId) })
      } else if (e instanceof ErroApi && e.campos.length > 0) {
        setErrosApi(errosDaApi(e.campos))
        setPasso(2)
        toast(e.message)
      } else {
        toast(mensagemDoErro(e))
      }
    } finally {
      setAbrindo(false)
    }
  }

  // atalho R: grava (fora de campos de texto). Atalho não anima.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.closest('input, textarea, select, [contenteditable="true"]') ?? null))
        return
      e.preventDefault()
      void gravar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  })

  if (coleta.maquina.isPending) return <EstadoCarregando rotulo="Carregando…" />

  const passos = etapa === 'T0' ? ([1, 3] as const) : ([1, 2, 3] as const)
  const indiceDoPasso = passos.indexOf(passo as never)
  const proximoPasso = passos[indiceDoPasso + 1]
  const passoAnterior = passos[indiceDoPasso - 1]

  return (
    <div className="flex flex-col gap-3 pb-40 lg:pb-0">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0">
          <nav aria-label="Caminho" className="text-12 text-apoio">
            <Link
              to="/coleta"
              search={{ maquina: maquinaId }}
              className="underline underline-offset-2"
            >
              Coleta
            </Link>{' '}
            / <span aria-current="page">Preparar</span>
          </nav>
          <h1 className="flex items-center gap-2 text-24 font-semibold">
            Preparar <span className="valor">{etapa}</span>
            {simulado ? <SeloSim /> : null}
          </h1>
          <p className="text-13 text-apoio">
            {ROTULO_CONDICAO[condicaoEfetiva]} ·{' '}
            {rotacao === null ? (
              'rotação a escolher'
            ) : (
              <>
                <span className="valor">{rotacao}</span> rpm
              </>
            )}
            {celula ? ` · ${celula.validos}/${celula.meta} feitos` : ''}
          </p>
        </div>
        <ol className="ml-auto flex items-center gap-1 lg:hidden" aria-label="Passos">
          {passos.map((p, i) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => setPasso(p)}
                aria-current={p === passo ? 'step' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-1 border-b-2 px-2 text-13',
                  p === passo
                    ? 'border-texto font-semibold text-texto'
                    : 'border-transparent text-apoio',
                )}
              >
                <span className="valor">{i + 1}</span>{' '}
                {p === 1 ? 'Gravação' : p === 2 ? 'Receita' : 'Checagem'}
              </button>
            </li>
          ))}
        </ol>
      </header>

      {sessaoAtiva ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-linha-forte bg-modulo px-3 py-2 text-13">
          <span className="text-texto">
            Sessão: <span className="font-semibold">{etapaAtual(sessaoAtiva)}</span> de{' '}
            {sessaoAtiva.etapas.join(' → ')} a <span className="valor">{sessaoAtiva.rotacao}</span>{' '}
            rpm. Receita montada uma vez e reaproveitada.
          </span>
          <span className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                const nova = pular(sessaoAtiva)
                definirSessaoDeColeta(nova)
                void navegar({ to: '/coleta', search: { maquina: maquinaId } })
                toast(`Etapa pulada. Próxima: ${textoDaProxima(nova)}`)
              }}
            >
              Pular esta etapa
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                definirSessaoDeColeta(null)
                toast('Sessão encerrada.')
              }}
            >
              Encerrar sessão
            </Button>
          </span>
        </div>
      ) : null}

      {conflito ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border border-dashed border-texto bg-modulo px-3 py-2 text-15"
        >
          <CircleAlert aria-hidden="true" className="size-4" strokeWidth={1.75} />
          <span className="min-w-0 flex-1">{conflito}</span>
          <Link
            to="/coleta"
            search={{ maquina: maquinaId }}
            className={buttonVariants({ variant: 'default' })}
          >
            Ir para a gravação aberta
          </Link>
        </div>
      ) : null}

      {/* o cartão fica sempre à vista ao preparar: no celular, acima de cada passo */}
      <CartaoInstrucao etapa={etapa} condicao={condicaoEfetiva} className="lg:hidden" />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <Painel className="xl:grid-cols-2 xl:items-stretch">
          <div
            className={cn(
              'flex flex-col bg-modulo [&>section]:flex-1',
              passo !== 1 && 'max-lg:hidden',
            )}
          >
            <Modulo rotulo="Gravação" simulado={simulado}>
              <EscolhaDaGravacao
                etapa={etapa}
                condicao={condicao}
                rotacao={rotacaoPadrao}
                plano={planoOrdenado}
                nominais={coleta.nominais}
                travado={!!sessaoAtiva}
                aoMudarEtapa={(e) => {
                  setEtapa(e)
                  if (e === 'T0' && passo === 2) setPasso(1)
                }}
                aoMudarCondicao={setCondicao}
                aoMudarRotacao={setRotacaoEscolhida}
              />
              {!sessaoAtiva ? (
                <OpcaoDeSessao
                  comSessao={comSessao}
                  comT0={comT0}
                  rotacao={rotacaoPadrao}
                  aoMudarSessao={setComSessao}
                  aoMudarT0={(v) => {
                    setComT0(v)
                    if (v) setEtapa('T0')
                    else if (etapa === 'T0') setEtapa('T1')
                  }}
                />
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <CampoRepeticao
                  valor={repeticaoDigitada}
                  sugerida={repeticaoSugerida(celula)}
                  aoMudar={setRepeticaoDigitada}
                />
                <CampoObservacao valor={observacao} aoMudar={setObservacao} />
              </div>
            </Modulo>
          </div>

          {etapa !== 'T0' ? (
            <div
              className={cn(
                'flex flex-col bg-modulo [&>section]:flex-1',
                passo !== 2 && 'max-lg:hidden',
              )}
            >
              <Modulo
                rotulo="Receita do corte"
                explica="receita"
                detalhe="opcional: o que ficar em branco não aparece e não impede a gravação"
                simulado={simulado}
              >
                <FormularioDaReceita
                  maquinaId={maquinaId}
                  simulado={simulado}
                  receita={receita}
                  erros={erros}
                  avisos={avisos}
                  aoMudar={(parte) => {
                    // atualização parcial: criar um item no catálogo termina depois, sem apagar o
                    // que foi digitado enquanto isso
                    setReceita((r) => ({ ...r, ...parte }))
                    setErrosApi({})
                  }}
                />
              </Modulo>
            </div>
          ) : null}
        </Painel>

        <div className={cn('flex flex-col gap-3', passo !== 3 && 'max-lg:hidden')}>
          <CartaoInstrucao etapa={etapa} condicao={condicaoEfetiva} className="max-lg:hidden" />
          <Painel>
            <Modulo rotulo="Checagem antes de gravar" simulado={simulado}>
              <ListaPreVoo key={`${etapa}-${rotacao}`} itens={itens} />
            </Modulo>
          </Painel>
          <div className="hidden justify-center py-2 lg:flex">
            <BotaoRec
              aoGravar={() => void gravar()}
              desabilitado={travado}
              ocupado={abrindo}
              motivo={motivoDoBloqueio}
            />
          </div>
        </div>
      </div>

      {/* zona do polegar (celular): navegação dos passos e, no último, o REC */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linha-forte bg-modulo px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        {passo === 3 ? (
          <div className="flex items-end justify-between gap-3">
            <Button size="toque" onClick={() => passoAnterior && setPasso(passoAnterior)}>
              <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
              Voltar
            </Button>
            <BotaoRec
              aoGravar={() => void gravar()}
              desabilitado={travado}
              ocupado={abrindo}
              motivo={motivoDoBloqueio}
            />
            <span className="w-20" aria-hidden="true" />
          </div>
        ) : (
          <div className="flex gap-3">
            {passoAnterior ? (
              <Button size="toque" className="flex-1" onClick={() => setPasso(passoAnterior)}>
                <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
                Voltar
              </Button>
            ) : (
              <Link
                to="/coleta"
                search={{ maquina: maquinaId }}
                className={cn(buttonVariants({ variant: 'outline', size: 'toque' }), 'flex-1')}
              >
                Cancelar
              </Link>
            )}
            <Button
              variant="default"
              size="toque"
              className="flex-[2]"
              onClick={() => proximoPasso && setPasso(proximoPasso)}
            >
              {proximoPasso === 2 ? 'Receita' : 'Checagem'}
              <ArrowRight aria-hidden="true" strokeWidth={1.75} />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Campos da API → campos do formulário, para o erro aparecer no lugar certo. */
function errosDaApi(campos: { campo: string; mensagem: string }[]): ErrosDaReceita {
  const mapa: Record<string, keyof Receita> = {
    avanco_alvo: 'avanco',
    profundidade_corte_mm: 'profundidade',
    diametro_peca_mm: 'diametro',
    material_id: 'material',
    ferramenta_id: 'ferramenta',
    fluido_corte: 'fluido',
  }
  const erros: ErrosDaReceita = {}
  for (const c of campos) {
    const campo = mapa[c.campo]
    if (campo) erros[campo] = c.mensagem
  }
  return erros
}

function EscolhaDaGravacao({
  etapa,
  condicao,
  rotacao,
  plano,
  nominais,
  travado,
  aoMudarEtapa,
  aoMudarCondicao,
  aoMudarRotacao,
}: {
  etapa: Etapa
  condicao: Condicao
  rotacao: number | null
  plano: number[]
  nominais: readonly number[]
  travado: boolean
  aoMudarEtapa: (e: Etapa) => void
  aoMudarCondicao: (c: Condicao) => void
  aoMudarRotacao: (r: number | null) => void
}) {
  const idDigitada = useId()
  const [digitada, setDigitada] = useState('')
  const outras = nominais.filter((n) => !plano.includes(n))
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={travado} className="flex flex-col gap-1.5">
        <legend className="rotulo mb-1.5">Etapa</legend>
        <div className="grid grid-cols-4" role="radiogroup" aria-label="Etapa">
          {ETAPAS.map((e) => (
            <BotaoSegmento
              key={e}
              marcado={e === etapa}
              onClick={() => aoMudarEtapa(e)}
              rotulo={`${e}: ${ROTULO_ETAPA[e]}`}
            >
              <span className="valor text-18 font-semibold">{e}</span>
            </BotaoSegmento>
          ))}
        </div>
        <p className="text-15 text-texto" aria-live="polite">
          {DEFINICAO_ETAPA[etapa]}
        </p>
      </fieldset>

      <fieldset disabled={travado} className="flex flex-col gap-1.5">
        <legend className="rotulo mb-1.5">Condição</legend>
        {etapa === 'T3' ? (
          <>
            <div
              className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
              role="radiogroup"
              aria-label="Condição de treino"
            >
              {CONDICOES_DE_TREINO.map((c) => (
                <BotaoSegmento
                  key={c}
                  separado
                  marcado={c === condicao}
                  onClick={() => aoMudarCondicao(c)}
                  rotulo={ROTULO_CONDICAO[c]}
                >
                  {ROTULO_CONDICAO[c]}
                </BotaoSegmento>
              ))}
            </div>
            <div className="mt-1 flex flex-col gap-1">
              <span className="rotulo">Validação (nunca é classe de treino)</span>
              <BotaoSegmento
                separado
                tracejado
                marcado={condicao === 'sensor_solto'}
                onClick={() => aoMudarCondicao('sensor_solto')}
                rotulo="Sensor solto, validação"
              >
                Sensor solto · validação
              </BotaoSegmento>
            </div>
          </>
        ) : (
          <p className="text-15 text-texto">
            Normal.{' '}
            <span className="text-apoio">
              Em T0, T1 e T2 a condição é sempre normal: ela só muda o corte.
            </span>
          </p>
        )}
      </fieldset>

      <fieldset disabled={travado} className="flex flex-col gap-1.5">
        <legend className="rotulo mb-1.5">Rotação alvo</legend>
        {etapa === 'T0' ? (
          <p className="text-15 text-texto">
            <span className="valor">0</span> rpm: torno desligado.
          </p>
        ) : (
          <>
            {plano.length > 0 ? (
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label="Rotações do plano"
              >
                {plano.map((r) => (
                  <BotaoSegmento
                    key={r}
                    separado
                    marcado={r === rotacao}
                    onClick={() => aoMudarRotacao(r)}
                    rotulo={`${r} rpm`}
                  >
                    <span className="valor text-15">{r}</span>
                  </BotaoSegmento>
                ))}
              </div>
            ) : (
              <p className="text-13 text-apoio">O plano ainda não tem rotações; escolha abaixo.</p>
            )}
            {outras.length > 0 ? (
              <details className="group">
                <summary className="flex min-h-11 cursor-default items-center gap-2 text-13 text-texto select-none">
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  Outras rotações do torno
                </summary>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {outras.map((r) => (
                    <BotaoSegmento
                      key={r}
                      separado
                      marcado={r === rotacao}
                      onClick={() => aoMudarRotacao(r)}
                      rotulo={`${r} rpm`}
                    >
                      <span className="valor text-13">{r}</span>
                    </BotaoSegmento>
                  ))}
                </div>
              </details>
            ) : null}
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={idDigitada} className="rotulo">
                  Digitar a rotação
                </label>
                <div className="flex">
                  <input
                    id={idDigitada}
                    inputMode="numeric"
                    value={digitada}
                    onChange={(e) => {
                      setDigitada(e.target.value)
                      const n = Number(e.target.value.replace(',', '.'))
                      if (Number.isFinite(n) && n > 0 && n <= 30000) aoMudarRotacao(Math.round(n))
                    }}
                    placeholder="ex.: 630"
                    className="valor min-h-11 w-28 rounded-l-2 border border-linha-forte bg-rebaixo px-2.5 text-15"
                  />
                  <span className="flex items-center rounded-r-2 border border-l-0 border-linha-forte bg-modulo px-2 text-13 text-apoio">
                    rpm
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </fieldset>
    </div>
  )
}

function BotaoSegmento({
  marcado,
  onClick,
  rotulo,
  children,
  separado = false,
  tracejado = false,
}: {
  marcado: boolean
  onClick: () => void
  rotulo: string
  children: React.ReactNode
  separado?: boolean
  tracejado?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcado}
      aria-label={rotulo}
      onClick={onClick}
      className={cn(
        'relevo flex min-h-14 min-w-14 items-center justify-center border px-3 text-15 select-none disabled:opacity-60',
        separado ? 'rounded-2' : 'rounded-0 not-first:-ml-px first:rounded-l-2 last:rounded-r-2',
        marcado
          ? 'z-[1] border-texto bg-rebaixo font-semibold text-texto shadow-[inset_0_1px_0_var(--relevo-sombra),inset_0_-1px_0_var(--relevo-luz)]'
          : 'border-linha-forte bg-modulo text-texto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce',
        tracejado && !marcado && 'border-dashed',
      )}
    >
      {children}
    </button>
  )
}

function OpcaoDeSessao({
  comSessao,
  comT0,
  rotacao,
  aoMudarSessao,
  aoMudarT0,
}: {
  comSessao: boolean
  comT0: boolean
  rotacao: number | null
  aoMudarSessao: (v: boolean) => void
  aoMudarT0: (v: boolean) => void
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-linha pt-3">
      <label className="flex min-h-14 items-center gap-3 text-15 text-texto">
        <input
          type="checkbox"
          checked={comSessao}
          onChange={(e) => aoMudarSessao(e.target.checked)}
          className="size-6 shrink-0 accent-[var(--acao)]"
        />
        Gravar a sequência nesta rotação (T1 → T2 → T3)
      </label>
      {comSessao ? (
        <>
          <label className="ml-9 flex min-h-14 items-center gap-3 text-15 text-texto">
            <input
              type="checkbox"
              checked={comT0}
              onChange={(e) => aoMudarT0(e.target.checked)}
              className="size-6 shrink-0 accent-[var(--acao)]"
            />
            Começar pelo T0 (torno desligado)
          </label>
          <p className="ml-9 text-13 text-apoio">
            A receita é montada uma vez e reaproveitada; ao encerrar uma etapa, a seguinte já vem
            preparada{rotacao ? ` a ${rotacao} rpm` : ''}. Dá para pular uma etapa ou encerrar a
            sessão. A sessão fica guardada neste navegador.
          </p>
        </>
      ) : null}
    </div>
  )
}

function CampoRepeticao({
  valor,
  sugerida,
  aoMudar,
}: {
  valor: string
  sugerida: number
  aoMudar: (v: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="rotulo">
        Repetição
      </label>
      <input
        id={id}
        inputMode="numeric"
        value={valor}
        placeholder={String(sugerida)}
        onChange={(e) => aoMudar(e.target.value.replace(/\D/g, ''))}
        aria-describedby={`${id}-ajuda`}
        className="valor min-h-11 w-full rounded-2 border border-linha-forte bg-rebaixo px-2.5 text-15"
      />
      <span id={`${id}-ajuda`} className="text-12 text-apoio">
        sugerida: {sugerida}
      </span>
    </div>
  )
}

function CampoObservacao({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="rotulo">
        Observação (opcional)
      </label>
      <textarea
        id={id}
        value={valor}
        maxLength={2000}
        rows={2}
        onChange={(e) => aoMudar(e.target.value)}
        className="min-h-11 w-full rounded-2 border border-linha-forte bg-rebaixo px-2.5 py-2 text-15"
      />
    </div>
  )
}

function FormularioDaReceita({
  maquinaId,
  simulado,
  receita,
  erros,
  avisos,
  aoMudar,
}: {
  maquinaId: number
  simulado: boolean
  receita: Receita
  erros: ErrosDaReceita
  avisos: ErrosDaReceita
  aoMudar: (parte: Partial<Receita>) => void
}) {
  const ultimo = useQuery(consultaUltimoEnsaio(maquinaId, simulado))
  const ultimaReceita = useMemo(
    () => (ultimo.data ? receitaDoEnsaio(ultimo.data) : null),
    [ultimo.data],
  )
  const temUltima =
    ultimaReceita !== null && JSON.stringify(ultimaReceita) !== JSON.stringify(RECEITA_VAZIA)
  const idFluido = useId()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!temUltima}
          onClick={() => ultimaReceita && aoMudar(ultimaReceita)}
          title={
            temUltima ? `Receita de ${ultimo.data?.codigo ?? ''}` : 'Nenhuma gravação com receita'
          }
        >
          <RotateCcw aria-hidden="true" strokeWidth={1.5} />
          Repetir a receita da última gravação
        </Button>
        {!temUltima && ultimo.isSuccess ? (
          <span className="text-12 text-apoio">a última gravação não tinha receita</span>
        ) : null}
        {JSON.stringify(receita) !== JSON.stringify(RECEITA_VAZIA) ? (
          <Button variant="ghost" onClick={() => aoMudar(RECEITA_VAZIA)}>
            Limpar
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoCatalogo
          tipo="materiais"
          rotulo="Material"
          valor={receita.material}
          aoMudar={(material) => aoMudar({ material })}
          erro={erros.material}
        />
        <CampoCatalogo
          tipo="ferramentas"
          rotulo="Ferramenta"
          valor={receita.ferramenta}
          aoMudar={(ferramenta) => aoMudar({ ferramenta })}
          erro={erros.ferramenta}
        />
        <CampoNumero
          nome="avanco"
          rotulo="Avanço"
          unidade="mm/volta"
          exemplo="ex.: 0,15"
          valor={receita.avanco}
          aoMudar={(avanco) => aoMudar({ avanco })}
          erro={erros.avanco}
          aviso={avisos.avanco}
        />
        <CampoNumero
          nome="profundidade"
          rotulo="Profundidade de corte"
          unidade="mm"
          exemplo="ex.: 1,5"
          valor={receita.profundidade}
          aoMudar={(profundidade) => aoMudar({ profundidade })}
          erro={erros.profundidade}
          aviso={avisos.profundidade}
        />
        <CampoNumero
          nome="diametro"
          rotulo="Diâmetro da peça"
          unidade="mm"
          exemplo="ex.: 38"
          valor={receita.diametro}
          aoMudar={(diametro) => aoMudar({ diametro })}
          erro={erros.diametro}
          aviso={avisos.diametro}
        />
        <fieldset className="flex flex-col gap-1">
          <legend id={idFluido} className="rotulo mb-1">
            Fluido de corte
          </legend>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-labelledby={idFluido}>
            {(Object.keys(ROTULO_FLUIDO) as Fluido[]).map((f) => (
              <BotaoSegmento
                key={f}
                separado
                marcado={receita.fluido === f}
                onClick={() => aoMudar({ fluido: receita.fluido === f ? null : f })}
                rotulo={ROTULO_FLUIDO[f]}
              >
                <span className="text-13">{ROTULO_FLUIDO[f]}</span>
              </BotaoSegmento>
            ))}
          </div>
          <span className="text-12 text-apoio">toque de novo para deixar em branco</span>
        </fieldset>
      </div>
      <p className="text-12 text-apoio">
        Faixas aceitas: avanço {FAIXAS.avanco.min.toLocaleString('pt-BR')} a{' '}
        {FAIXAS.avanco.max.toLocaleString('pt-BR')} mm/volta; profundidade{' '}
        {FAIXAS.profundidade.min.toLocaleString('pt-BR')} a{' '}
        {FAIXAS.profundidade.max.toLocaleString('pt-BR')} mm; diâmetro{' '}
        {FAIXAS.diametro.min.toLocaleString('pt-BR')} a{' '}
        {FAIXAS.diametro.max.toLocaleString('pt-BR')} mm. Fora disso é erro de digitação.
      </p>
    </div>
  )
}

/** Lista de pré-voo: cada linha confirma em sequência, 60 ms uma depois da outra. */
function ListaPreVoo({ itens }: { itens: ItemDoPreVoo[] }) {
  // com movimento reduzido, tudo aparece de uma vez; senão, uma linha a cada 60 ms (trocar etapa ou
  // rotação remonta a lista e a sequência recomeça)
  const [reduzido] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [mostrados, setMostrados] = useState(0)
  useEffect(() => {
    if (reduzido) return
    let n = 0
    const t = setInterval(() => {
      n += 1
      setMostrados(n)
      if (n >= 8) clearInterval(t)
    }, 60)
    return () => clearInterval(t)
  }, [reduzido])
  return (
    <ul className="flex flex-col" data-testid="pre-voo">
      {itens.map((item, i) => {
        const visivel = reduzido || i < mostrados
        return (
          <li
            key={item.chave}
            data-estado={item.estado}
            className={cn(
              'flex items-start gap-2.5 border-b border-linha py-2 last:border-b-0',
              'transition-opacity duration-150',
              visivel ? 'opacity-100' : 'opacity-0',
            )}
          >
            <IconeDoItem estado={item.estado} />
            <div className="flex min-w-0 flex-col">
              <span className="text-15 text-texto">
                {item.rotulo}
                <span className="sr-only">
                  {item.estado === 'ok'
                    ? ': ok'
                    : item.estado === 'aviso'
                      ? ': aviso'
                      : ': bloqueia a gravação'}
                </span>
              </span>
              <span className="text-13 text-apoio">{item.detalhe}</span>
              {item.oQueFazer ? (
                <span className="text-13 font-medium text-texto">
                  {item.estado === 'bloqueia' ? 'Bloqueia: ' : ''}
                  {item.oQueFazer}
                </span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function IconeDoItem({ estado }: { estado: ItemDoPreVoo['estado'] }) {
  if (estado === 'ok')
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-texto">
        <Check aria-hidden="true" className="size-3" strokeWidth={2.5} />
      </span>
    )
  if (estado === 'aviso')
    return (
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-texto" strokeWidth={1.75} />
    )
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center border-2 border-dashed border-texto">
      <span aria-hidden="true" className="text-12 leading-none font-bold">
        ×
      </span>
    </span>
  )
}

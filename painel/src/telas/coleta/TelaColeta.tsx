import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Download, ListChecks } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'

import { baixarCsvDosEnsaios, gravarPlano } from '@/api/coleta'
import { mensagemDoErro } from '@/api/erros'
import { MatrizCobertura } from '@/componentes/coleta/MatrizCobertura'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { Button, buttonVariants } from '@/componentes/ui/button'
import { DEFINICAO_ETAPA, ROTULO_CONDICAO, rotacoesDoPlano, type Celula } from '@/dominio/coleta'
import { formatarPercentual } from '@/dominio/formato'
import { resumoDaReceita } from '@/dominio/receita'
import { pular, textoDaProxima, proximaDaSessao } from '@/dominio/sessao'
import { definirMetaDaColeta, definirSessaoDeColeta, useSessaoDeColeta } from '@/estado/coleta'
import { useFonte } from '@/estado/preferencias'
import { useColeta } from '@/hooks/useColeta'
import { useMaquinaDaColeta } from '@/hooks/useMaquinaDaColeta'
import { cn } from '@/lib/utils'

import { Gravacao } from './Gravacao'
import { ResumoDaGravacao } from './ResumoDaGravacao'

type Props = { maquinaEscolhida?: number; resumo?: number }

/**
 * Coleta: gravar aprendizado de forma intuitiva. Se há ensaio aberto na máquina, a tela abre direto
 * na gravação (retomar). Depois de encerrar, mostra o resumo. Senão, a entrada: próxima gravação
 * sugerida, sessão em andamento e a matriz de cobertura (tocar numa célula prepara aquela gravação).
 */
export function TelaColeta({ maquinaEscolhida, resumo }: Props) {
  const { maquinas, id } = useMaquinaDaColeta(maquinaEscolhida)

  useEffect(() => {
    document.title = 'Coleta · PredictSpin'
  }, [])

  if (maquinas.isPending) return <EstadoCarregando rotulo="Carregando a coleta…" />
  if (maquinas.isError) return <EstadoErro erro={maquinas.error} />
  if (id === undefined) {
    return (
      <Painel className="max-w-2xl">
        <Modulo rotulo="Coleta" semRecuo>
          <EstadoVazio titulo="Nenhuma máquina cadastrada.">
            A coleta grava ensaios numa máquina; cadastre a máquina na API primeiro.
          </EstadoVazio>
        </Modulo>
      </Painel>
    )
  }
  return <ColetaDaMaquina maquinaId={id} resumo={resumo} />
}

function ColetaDaMaquina({ maquinaId, resumo }: { maquinaId: number; resumo?: number }) {
  const simulado = useFonte() === 'simulado'
  const coleta = useColeta(maquinaId, simulado)
  const aberto = coleta.ensaioAberto.data

  if (coleta.ensaioAberto.isPending || coleta.maquina.isPending)
    return <EstadoCarregando rotulo="Conferindo se há gravação em andamento…" />
  if (coleta.maquina.isError) return <EstadoErro erro={coleta.maquina.error} />
  if (aberto) return <Gravacao ensaio={aberto} maquinaId={maquinaId} />
  if (resumo !== undefined) return <ResumoDaGravacao ensaioId={resumo} maquinaId={maquinaId} />
  return <EntradaDaColeta maquinaId={maquinaId} />
}

function EntradaDaColeta({ maquinaId }: { maquinaId: number }) {
  const simulado = useFonte() === 'simulado'
  const coleta = useColeta(maquinaId, simulado)
  const sessao = useSessaoDeColeta()
  const navegar = useNavigate()
  const sessaoDaMaquina =
    sessao?.maquinaId === maquinaId && sessao.simulado === simulado ? sessao : null
  const proximaDaSessaoAtual = sessaoDaMaquina ? proximaDaSessao(sessaoDaMaquina) : null
  const codigo = coleta.maquina.data?.codigo ?? ''

  const preparar = (c: Pick<Celula, 'etapa' | 'condicao' | 'rotacao'>, daSessao = false) =>
    void navegar({
      to: '/coleta/preparar',
      search: {
        maquina: maquinaId,
        etapa: c.etapa,
        condicao: c.condicao,
        rotacao: c.rotacao,
        sessao: daSessao || undefined,
      },
    })

  const semPlano = rotacoesDoPlano(coleta.plano).length === 0

  return (
    <div className="flex flex-col gap-3">
      <CabecalhoDaColeta codigo={codigo} maquinaId={maquinaId} />

      <Painel className="lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-px bg-linha lg:col-span-4">
          {sessaoDaMaquina && proximaDaSessaoAtual ? (
            <Modulo rotulo="Sessão em andamento" simulado={simulado}>
              <div className="flex flex-col gap-3">
                <p className="text-18 font-semibold text-texto">
                  Continuar sessão: próxima é {textoDaProxima(sessaoDaMaquina)}
                </p>
                <p className="text-13 text-apoio">
                  Sequência {sessaoDaMaquina.etapas.join(' → ')} a{' '}
                  <span className="valor">{sessaoDaMaquina.rotacao}</span> rpm
                  {sessaoDaMaquina.gravadas.length > 0
                    ? ` · gravadas: ${sessaoDaMaquina.gravadas.map((g) => g.etapa).join(', ')}`
                    : ''}
                  {sessaoDaMaquina.puladas.length > 0
                    ? ` · puladas: ${sessaoDaMaquina.puladas.join(', ')}`
                    : ''}
                </p>
                <ResumoCurtoDaReceita receita={sessaoDaMaquina.receita} />
                <Button
                  variant="default"
                  className="min-h-14 w-full text-15"
                  onClick={() => preparar(proximaDaSessaoAtual, true)}
                >
                  Preparar {proximaDaSessaoAtual.etapa} a {proximaDaSessaoAtual.rotacao} rpm
                  <ArrowRight aria-hidden="true" strokeWidth={1.75} />
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => definirSessaoDeColeta(pular(sessaoDaMaquina))}>
                    Pular {proximaDaSessaoAtual.etapa}
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
                </div>
              </div>
            </Modulo>
          ) : null}

          <Modulo rotulo="Próxima gravação sugerida" simulado={simulado} className="flex-1">
            {coleta.cobertura.isPending ? (
              <EstadoCarregando rotulo="Calculando a cobertura…" />
            ) : coleta.cobertura.isError ? (
              <EstadoErro
                erro={coleta.cobertura.error}
                aoTentarDeNovo={() => void coleta.cobertura.refetch()}
              />
            ) : coleta.sugerida ? (
              <div className="flex flex-col gap-3" data-testid="sugestao">
                <div className="flex items-baseline gap-3">
                  <span className="valor text-32 font-semibold text-texto">
                    {coleta.sugerida.etapa}
                  </span>
                  <span className="text-18 text-texto">
                    {ROTULO_CONDICAO[coleta.sugerida.condicao]} ·{' '}
                    <span className="valor">{coleta.sugerida.rotacao}</span> rpm
                  </span>
                </div>
                <p className="text-15 text-apoio">{DEFINICAO_ETAPA[coleta.sugerida.etapa]}</p>
                <p className="text-13 text-texto">
                  Faltam <span className="valor font-semibold">{coleta.sugerida.faltam}</span> de{' '}
                  <span className="valor">{coleta.sugerida.meta}</span>
                  {coleta.sugerida.uso === 'validacao'
                    ? ' · validação, não é classe de treino'
                    : ''}
                </p>
                {semPlano ? (
                  <p className="text-13 text-apoio">
                    O plano não tem rotações: só o T0 entra na grade. Escolha as rotações em “Plano
                    e meta”.
                  </p>
                ) : null}
                <Button
                  variant={sessaoDaMaquina ? 'outline' : 'default'}
                  className="min-h-14 w-full text-15"
                  onClick={() => coleta.sugerida && preparar(coleta.sugerida)}
                >
                  Preparar
                  <ArrowRight aria-hidden="true" strokeWidth={1.75} />
                </Button>
              </div>
            ) : (
              <EstadoVazio titulo="A cobertura está completa nesta meta.">
                Toque numa célula da matriz para gravar mais, ou suba a meta em “Plano e meta”.
              </EstadoVazio>
            )}
          </Modulo>
        </div>

        <Modulo
          rotulo="Cobertura"
          explica="cobertura"
          simulado={simulado}
          className="lg:col-span-8"
          detalhe={
            <>
              ensaios válidos por célula, contra a meta ·{' '}
              <span className="valor text-texto">{formatarPercentual(coleta.percentual)}</span> da
              grade
            </>
          }
          semRecuo
        >
          <div className="flex flex-col">
            {coleta.cobertura.isError ? (
              <EstadoErro erro={coleta.cobertura.error} />
            ) : (
              <MatrizCobertura
                grade={coleta.grade}
                plano={coleta.plano}
                sugerida={coleta.sugerida ? chave(coleta.sugerida) : null}
                aoEscolher={(c) => preparar(c)}
                className="px-2 pt-1"
              />
            )}
            <p className="border-t border-linha px-3 py-1.5 text-12 text-apoio">
              Toque numa célula para preparar aquela gravação. ✓ preenchida = meta atingida;
              tracejada = validação (sensor solto), não é classe de treino; ▸ = sugerida.
            </p>
            <PlanoEMeta
              maquinaId={maquinaId}
              plano={coleta.plano}
              nominais={coleta.nominais}
              meta={coleta.meta}
            />
          </div>
        </Modulo>
      </Painel>
      <AcoesDaColeta maquinaId={maquinaId} className="lg:hidden" />
    </div>
  )
}

const chave = (c: Celula) => `${c.etapa}|${c.condicao}|${c.rotacao}`

function ResumoCurtoDaReceita({ receita }: { receita: Parameters<typeof resumoDaReceita>[0] }) {
  const linhas = resumoDaReceita(receita)
  if (linhas.length === 0) return <p className="text-13 text-apoio">Sem receita preenchida.</p>
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-13">
      {linhas.map((l) => (
        <div key={l.rotulo} className="contents">
          <dt className="text-apoio">{l.rotulo}</dt>
          <dd className="truncate text-texto" title={l.valor}>
            {l.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Cabeçalho comum: título e máquina; as ações (ensaios, CSV, treino) ao lado no notebook. */
export function CabecalhoDaColeta({
  codigo,
  maquinaId,
  titulo = 'Coleta',
  naLista = false,
}: {
  codigo: string
  maquinaId: number
  titulo?: string
  /** Na própria lista de ensaios, o atalho para ela sai. */
  naLista?: boolean
}) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-24 font-semibold">{titulo}</h1>
        <p className="text-13 text-apoio">
          <span className="valor text-texto">{codigo}</span> · gravações rotuladas para o
          aprendizado
        </p>
      </div>
      <AcoesDaColeta
        maquinaId={maquinaId}
        naLista={naLista}
        className={cn('ml-auto', !naLista && 'max-lg:hidden')}
      />
    </header>
  )
}

/**
 * Ensaios gravados, exportar CSV e treinar. No celular ficam no fim da tela: em pé ao lado do torno,
 * o que importa primeiro é a próxima gravação.
 */
export function AcoesDaColeta({
  maquinaId,
  naLista = false,
  className,
}: {
  maquinaId: number
  naLista?: boolean
  className?: string
}) {
  const simulado = useFonte() === 'simulado'
  const [baixando, setBaixando] = useState(false)
  const idTreino = useId()
  return (
    <div className={cn('flex flex-wrap items-start gap-2', className)}>
      {naLista ? null : (
        <Link
          to="/coleta/ensaios"
          search={{ maquina: maquinaId }}
          className={buttonVariants({ variant: 'outline' })}
        >
          <ListChecks aria-hidden="true" strokeWidth={1.5} />
          Ensaios gravados
        </Link>
      )}
      <Button
        disabled={baixando}
        onClick={() => {
          setBaixando(true)
          baixarCsvDosEnsaios(maquinaId, simulado)
            .then((nome) => toast(`CSV salvo: ${nome}`))
            .catch((e: unknown) => toast(mensagemDoErro(e)))
            .finally(() => setBaixando(false))
        }}
      >
        <Download aria-hidden="true" strokeWidth={1.5} />
        {baixando ? 'Baixando…' : `Exportar CSV ${simulado ? '(simulado)' : '(real)'}`}
      </Button>
      <span className="flex flex-col items-start">
        <Button disabled aria-describedby={idTreino}>
          Treinar
        </Button>
        <span id={idTreino} className="text-12 text-apoio">
          disponível quando o serviço de treino existir
        </span>
      </span>
    </div>
  )
}

/** Um nível abaixo do caminho principal: o plano (rotações da grade) e a meta por célula. */
function PlanoEMeta({
  maquinaId,
  plano,
  nominais,
  meta,
}: {
  maquinaId: number
  plano: readonly number[]
  nominais: readonly number[]
  meta: number
}) {
  const cliente = useQueryClient()
  const [escolhidas, setEscolhidas] = useState<number[] | null>(null)
  const [salvando, setSalvando] = useState(false)
  const atuais = escolhidas ?? rotacoesDoPlano(plano)
  const mudou = escolhidas !== null && escolhidas.join(',') !== rotacoesDoPlano(plano).join(',')

  const salvar = async () => {
    setSalvando(true)
    try {
      await gravarPlano(maquinaId, atuais)
      await cliente.invalidateQueries({ queryKey: ['maquina', maquinaId] })
      await cliente.invalidateQueries({ queryKey: ['maquinas'] })
      await cliente.invalidateQueries({ queryKey: ['cobertura', maquinaId] })
      setEscolhidas(null)
      toast('Plano de coleta gravado.')
    } catch (e) {
      toast(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <details className="group border-t border-linha" data-testid="plano-e-meta">
      <summary className="flex min-h-11 cursor-default items-center gap-2 px-3 text-13 font-medium text-texto select-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ▸
        </span>
        Plano e meta
        <span className="text-12 font-normal text-apoio">
          {atuais.length} {atuais.length === 1 ? 'rotação' : 'rotações'} · meta {meta} por célula
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-3 pb-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="rotulo mb-1">Rotações do plano (marchas do torno)</legend>
          {nominais.length === 0 ? (
            <p className="text-13 text-apoio">A máquina não informa as rotações nominais.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {nominais.map((r) => {
                const marcada = atuais.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() =>
                      setEscolhidas(
                        marcada
                          ? atuais.filter((x) => x !== r)
                          : [...atuais, r].sort((a, b) => a - b),
                      )
                    }
                    className={cn(
                      'relevo valor min-h-11 min-w-14 rounded-2 border px-2 text-13',
                      marcada
                        ? 'border-acao bg-acao text-acao-texto'
                        : 'border-linha-forte bg-modulo text-texto',
                    )}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="default" disabled={!mudou || salvando} onClick={() => void salvar()}>
              {salvando ? 'Gravando…' : 'Gravar plano'}
            </Button>
            {mudou ? (
              <Button variant="ghost" onClick={() => setEscolhidas(null)}>
                Desfazer
              </Button>
            ) : null}
            <span className="text-12 text-apoio">
              {atuais.length} escolhidas; T0 grava sempre a 0 rpm.
            </span>
          </div>
        </fieldset>
        <label className="flex flex-wrap items-center gap-2 text-13">
          <span className="rotulo">Meta por célula</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={meta}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n >= 1) definirMetaDaColeta(n)
            }}
            className="valor min-h-11 w-20 rounded-2 border border-linha-forte bg-rebaixo px-2 text-15"
          />
          <span className="text-12 text-apoio">
            ensaios válidos (padrão 3; fica neste navegador)
          </span>
        </label>
      </div>
    </details>
  )
}

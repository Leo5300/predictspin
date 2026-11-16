import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

import {
  consultaEnsaio,
  consultaEventosMarcados,
  consultaResumo,
  descartarEnsaio,
} from '@/api/coleta'
import { mensagemDoErro } from '@/api/erros'
import { MatrizCobertura } from '@/componentes/coleta/MatrizCobertura'
import { EstadoCarregando, EstadoErro } from '@/componentes/instrumento/Estados'
import { Leitura } from '@/componentes/instrumento/Leitura'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SegurarParaConfirmar } from '@/componentes/instrumento/SegurarParaConfirmar'
import { Button, buttonVariants } from '@/componentes/ui/button'
import { chaveDaCelula, ROTULO_CONDICAO } from '@/dominio/coleta'
import { formatarCronometro } from '@/dominio/fita'
import { formatarNumero, formatarPercentual, formatarRpm } from '@/dominio/formato'
import { receitaDoEnsaio, resumoDaReceita } from '@/dominio/receita'
import { proximaDaSessao } from '@/dominio/sessao'
import { useSessaoDeColeta } from '@/estado/coleta'
import { useFonte } from '@/estado/preferencias'
import { useColeta } from '@/hooks/useColeta'

import { CabecalhoDaColeta } from './TelaColeta'

/**
 * Resumo da gravação encerrada: duração, janelas, saturadas, eventos, rotação média e receita. A
 * célula da matriz "carimba" (0,96 → 1 em 160 ms e escurece). Na sessão, o botão principal já é a
 * próxima etapa. Valores medidos não animam.
 */
/** "T1 a 450 rpm"; o T0 é sempre o torno desligado. */
function textoDaCelula(c: { etapa: string; rotacao: number } | null): string {
  if (!c) return ''
  return c.etapa === 'T0' ? 'T0, torno desligado' : `${c.etapa} a ${c.rotacao} rpm`
}

export function ResumoDaGravacao({ ensaioId, maquinaId }: { ensaioId: number; maquinaId: number }) {
  const simulado = useFonte() === 'simulado'
  const navegar = useNavigate()
  const coleta = useColeta(maquinaId, simulado)
  const ensaio = useQuery(consultaEnsaio(ensaioId))
  const resumo = useQuery(consultaResumo(ensaioId))
  const eventos = useQuery(consultaEventosMarcados(ensaioId))
  const sessao = useSessaoDeColeta()
  const proxima =
    sessao?.maquinaId === maquinaId && sessao.simulado === simulado ? proximaDaSessao(sessao) : null
  // carimbo só depois de a cobertura nova chegar (a célula já com a contagem nova)
  const carimbar = coleta.cobertura.isSuccess && !coleta.cobertura.isPlaceholderData

  if (ensaio.isPending || resumo.isPending)
    return <EstadoCarregando rotulo="Carregando o resumo…" />
  if (ensaio.isError) return <EstadoErro erro={ensaio.error} />
  if (resumo.isError) return <EstadoErro erro={resumo.error} />

  const e = ensaio.data
  const r = resumo.data
  const valido = !e.descartado && !e.aberto && r.janelas > 0
  const chave = chaveDaCelula({
    etapa: e.etapa,
    condicao: e.condicao,
    rotacao: e.rotacao_alvo_rpm,
  })
  const linhasReceita = resumoDaReceita(receitaDoEnsaio(e))

  const prepararProxima = () => {
    if (proxima) {
      void navegar({
        to: '/coleta/preparar',
        search: { maquina: maquinaId, ...proxima, sessao: true },
      })
    } else if (coleta.sugerida) {
      const s = coleta.sugerida
      void navegar({
        to: '/coleta/preparar',
        search: { maquina: maquinaId, etapa: s.etapa, condicao: s.condicao, rotacao: s.rotacao },
      })
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-40 lg:pb-0" data-testid="resumo-gravacao">
      <CabecalhoDaColeta codigo={coleta.maquina.data?.codigo ?? ''} maquinaId={maquinaId} />
      <Painel className="lg:grid-cols-12">
        <Modulo
          rotulo={e.descartado ? 'Gravação descartada' : 'Gravação encerrada'}
          detalhe={
            <>
              <span className="valor text-texto">{e.codigo}</span> · {e.etapa} ·{' '}
              {ROTULO_CONDICAO[e.condicao]} · {e.rotacao_alvo_rpm} rpm
            </>
          }
          simulado={e.simulado}
          className="lg:col-span-5"
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Leitura
                rotulo="Duração"
                valor={formatarCronometro(r.duracao_segundos)}
                tamanho="grande"
              />
              <Leitura rotulo="Janelas" valor={formatarNumero(r.janelas)} tamanho="grande" />
              <Leitura
                rotulo="Saturadas"
                valor={formatarNumero(r.janelas_saturadas)}
                tamanho="grande"
              />
              <Leitura
                rotulo="Eventos marcados"
                valor={eventos.data ? formatarNumero(eventos.data.length) : '…'}
                tamanho="grande"
              />
              <Leitura
                rotulo="Rotação média"
                valor={formatarRpm(r.rotacao_media_rpm)}
                unidade={r.rotacao_media_rpm === null ? undefined : 'rpm'}
                tamanho="grande"
              />
            </div>
            {r.janelas === 0 ? (
              <p className="border border-dashed border-texto px-2 py-1.5 text-13 text-texto">
                Nenhuma janela chegou durante a gravação: o ensaio não conta na cobertura.
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <span className="rotulo">Receita usada</span>
              {linhasReceita.length === 0 ? (
                <span className="text-13 text-apoio">nenhuma</span>
              ) : (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-13">
                  {linhasReceita.map((l) => (
                    <div key={l.rotulo} className="contents">
                      <dt className="text-apoio">{l.rotulo}</dt>
                      <dd className="truncate text-texto" title={l.valor}>
                        {l.valor}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div className="flex flex-col gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:border-linha-forte max-lg:bg-modulo max-lg:px-4 max-lg:pt-2 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {proxima || coleta.sugerida ? (
                <Button variant="default" className="min-h-14 text-15" onClick={prepararProxima}>
                  {proxima
                    ? `Preparar ${proxima.etapa} a ${proxima.rotacao} rpm`
                    : `Preparar a sugerida: ${textoDaCelula(coleta.sugerida)}`}
                  <ArrowRight aria-hidden="true" strokeWidth={1.75} />
                </Button>
              ) : null}
              <Link
                to="/coleta"
                search={{ maquina: maquinaId }}
                className={buttonVariants({ variant: 'outline' })}
              >
                Voltar à coleta
              </Link>
            </div>
            {!e.descartado ? (
              <SegurarParaConfirmar
                className="self-start"
                aoConfirmar={() => {
                  descartarEnsaio(e.id)
                    .then(() => {
                      toast(`Gravação ${e.codigo} descartada.`)
                      void ensaio.refetch()
                      void coleta.cobertura.refetch()
                    })
                    .catch((erro: unknown) => toast(mensagemDoErro(erro)))
                }}
              >
                Segure para descartar esta gravação
              </SegurarParaConfirmar>
            ) : null}
          </div>
        </Modulo>
        <Modulo
          rotulo="Cobertura"
          explica="cobertura"
          simulado={simulado}
          className="lg:col-span-7"
          detalhe={
            <>
              <span className="valor text-texto">{formatarPercentual(coleta.percentual)}</span> da
              grade{valido ? ' · a célula desta gravação está destacada' : ''}
            </>
          }
          semRecuo
        >
          <MatrizCobertura
            grade={coleta.grade}
            plano={coleta.plano}
            carimbada={valido && carimbar ? chave : null}
            aoEscolher={(c) =>
              void navegar({
                to: '/coleta/preparar',
                search: {
                  maquina: maquinaId,
                  etapa: c.etapa,
                  condicao: c.condicao,
                  rotacao: c.rotacao,
                },
              })
            }
            className="px-2 pt-1 pb-2"
          />
        </Modulo>
      </Painel>
    </div>
  )
}

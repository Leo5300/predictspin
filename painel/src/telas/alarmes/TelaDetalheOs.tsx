import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'

import {
  assumirOrdem,
  chavesAlarmes,
  concluirOrdem,
  consultaOrdem,
} from '@/api/adaptadores/alarmes'
import { mensagemDoErro } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import { FormularioDeConclusao } from '@/componentes/alarmes/LinhasDeAlarme'
import { BlocoSegundaOpiniao } from '@/componentes/alarmes/SegundaOpiniao'
import { EstadoCarregando, EstadoErro } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Button } from '@/componentes/ui/button'
import { Explica } from '@/componentes/ui/explica'
import { formatarDataHora, formatarNumero } from '@/dominio/formato'
import { nomeDaClasse } from '@/dominio/modelos'

/**
 * Detalhe da OS: dados, alerta de origem, segunda opinião, assumir e concluir (ADMIN e TECNICO) com o retorno do
 * técnico, comentário e a condição encontrada opcional (rótulo do próximo treino).
 */
export function TelaDetalheOs({ id }: { id: number }) {
  const consulta = useQuery(consultaOrdem(id))
  const cliente = useQueryClient()
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const podeAgir = papel === 'ADMIN' || papel === 'TECNICO'

  useEffect(() => {
    document.title = `OS ${id} · PredictSpin`
  }, [id])

  const refazer = () => {
    void cliente.invalidateQueries({ queryKey: ['ordem-servico', id] })
    if (consulta.data)
      void cliente.invalidateQueries({ queryKey: chavesAlarmes.ordens(consulta.data.simulado) })
  }
  const assumir = useMutation({
    mutationFn: () => assumirOrdem(id),
    onSuccess: refazer,
    onError: (e) => toast(mensagemDoErro(e)),
  })
  const concluir = useMutation({
    mutationFn: (p: Parameters<typeof concluirOrdem>) => concluirOrdem(...p),
    onSuccess: refazer,
    onError: (e) => toast(mensagemDoErro(e)),
  })

  if (consulta.isPending) return <EstadoCarregando />
  if (consulta.isError) return <EstadoErro erro={consulta.error} />
  const o = consulta.data
  const emAberto = o.status === 'aberta' || o.status === 'em_andamento'

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link to="/alarmes" className="text-13 text-apoio underline underline-offset-4">
          Alarmes
        </Link>
        <h1 className="text-24 font-semibold">{o.numero}</h1>
        <span className="border border-linha-forte px-1 text-12 tracking-[0.06em] uppercase">
          {o.status.replace('_', ' ')}
        </span>
        {o.simulado ? <SeloSim /> : null}
      </header>
      <Painel className="lg:grid-cols-2">
        <Modulo rotulo="Ordem de serviço">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-13">
            <dt className="text-apoio">Máquina e ponto</dt>
            <dd>
              {o.maquina} · ponto {o.ponto}
              {o.componente ? ` · ${o.componente}` : ''}
            </dd>
            <dt className="text-apoio">Aberta</dt>
            <dd>
              <span className="valor">{formatarDataHora(o.aberta_em)}</span> (
              {o.motivo_abertura === 'severidade' ? 'severidade acumulada' : 'alarme contínuo'})
            </dd>
            <dt className="flex items-center gap-1 text-apoio">
              Severidade <Explica chave="severidade" />
            </dt>
            <dd className="valor">{formatarNumero(o.severidade_acumulada, 0)} z·s</dd>
            <dt className="text-apoio">Alerta de origem</dt>
            <dd>
              {o.alerta_id ? (
                <Link
                  to="/alarmes/$alertaId"
                  params={{ alertaId: String(o.alerta_id) }}
                  className="underline underline-offset-4"
                >
                  alerta {o.alerta_id}
                </Link>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-apoio">Responsável</dt>
            <dd>{o.responsavel ?? '—'}</dd>
            <dt className="text-apoio">Retorno</dt>
            <dd>
              {o.retorno_tecnico === 'confirmada'
                ? 'confirmada: havia problema'
                : o.retorno_tecnico === 'rejeitada'
                  ? 'rejeitada: falso positivo'
                  : 'ainda sem retorno'}
              {o.condicao_encontrada ? ` · encontrado: ${nomeDaClasse(o.condicao_encontrada)}` : ''}
              {o.comentario_tecnico ? ` · ${o.comentario_tecnico}` : ''}
            </dd>
          </dl>
          <p className="mt-3 border-t border-linha-forte pt-2 text-15 font-semibold">
            <span className="rotulo mb-0.5 flex items-center gap-1">
              Ação recomendada <Explica chave="acao_recomendada" />
            </span>
            {o.acao_recomendada}
          </p>
          {o.explicacao ? <p className="mt-1 text-13 text-apoio">{o.explicacao}</p> : null}
          {emAberto && podeAgir ? (
            <div className="mt-3 flex flex-col gap-2">
              {o.status === 'aberta' ? (
                <Button
                  variant="default"
                  className="self-start"
                  onClick={() => assumir.mutate()}
                  disabled={assumir.isPending}
                >
                  Assumir OS
                </Button>
              ) : null}
              <FormularioDeConclusao
                embutido
                aoConcluir={(retorno, comentario, condicao) =>
                  concluir.mutate([id, retorno, comentario, condicao])
                }
              />
            </div>
          ) : null}
        </Modulo>
        <Modulo rotulo="Segunda opinião" explica="modelo">
          <div className="flex flex-col gap-4">
            <BlocoSegundaOpiniao titulo="Na abertura" opiniao={o.opiniao_abertura} />
            <BlocoSegundaOpiniao titulo="Mais recente" opiniao={o.opiniao_recente} />
            <p className="text-12 text-apoio">
              Estimativa do modelo. Não abre nem fecha a OS e não muda a ação recomendada: isso é da
              regra.
            </p>
          </div>
        </Modulo>
      </Painel>
    </div>
  )
}

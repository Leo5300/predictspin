import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  assumirOrdem,
  cancelarSupressao,
  chavesAlarmes,
  concluirOrdem,
  consultaAlarmes,
  consultaOrdensDeServico,
  reconhecerAlarme,
  suprimirAlarme,
  type Alarme,
  type CondicaoEncontrada,
  type RetornoTecnico,
} from '@/api/adaptadores/alarmes'
import { consultaMaquinas } from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import { LinhaAlarme, LinhaOrdemServico } from '@/componentes/alarmes/LinhasDeAlarme'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Explica } from '@/componentes/ui/explica'
import { ToggleGroup, ToggleGroupItem } from '@/componentes/ui/toggle-group'
import { useFonte } from '@/estado/preferencias'
import { useAlarmesAoVivo } from '@/hooks/useAlarmesAoVivo'

type FiltroEstado = 'abertos' | 'todos'
type FiltroPrioridade = 'todas' | 'alta' | 'baixa'

const EM_ABERTO: ReadonlySet<Alarme['estado']> = new Set([
  'ativo_nao_reconhecido',
  'ativo_reconhecido',
  'normalizado_nao_reconhecido',
  'suprimido',
])

/**
 * Alarmes (ISA-18.2) e ordens de serviço, ao vivo pelo evento "alerta" e "os" da máquina. Real e
 * simulado nunca se misturam: a fonte é a da barra superior. Reconhecer: qualquer usuário, segurando o
 * botão. Suprimir: só ADMIN, com motivo e prazo. Assumir e concluir OS: ADMIN e TECNICO.
 */
export function TelaAlarmes() {
  const simulado = useFonte() === 'simulado'
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const cliente = useQueryClient()
  const maquinas = useQuery(consultaMaquinas())
  useAlarmesAoVivo(maquinas.data?.conteudo[0]?.id, simulado)
  const alarmes = useQuery(consultaAlarmes(simulado))
  const ordens = useQuery(consultaOrdensDeServico(simulado))
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('abertos')
  const [filtroPrioridade, setFiltroPrioridade] = useState<FiltroPrioridade>('todas')
  const [filtroPonto, setFiltroPonto] = useState<string>('todos')

  useEffect(() => {
    document.title = 'Alarmes · PredictSpin'
  }, [])

  const refazer = () => {
    void cliente.invalidateQueries({ queryKey: chavesAlarmes.alarmes(simulado) })
    void cliente.invalidateQueries({ queryKey: chavesAlarmes.ordens(simulado) })
  }
  const aoErrar = (erro: unknown) => toast(mensagemDoErro(erro))
  const reconhecer = useMutation({
    mutationFn: reconhecerAlarme,
    onSuccess: refazer,
    onError: aoErrar,
  })
  const suprimir = useMutation({
    mutationFn: (p: { id: number; motivo: string; minutos: number }) =>
      suprimirAlarme(p.id, p.motivo, p.minutos),
    onSuccess: refazer,
    onError: aoErrar,
  })
  const cancelar = useMutation({
    mutationFn: cancelarSupressao,
    onSuccess: refazer,
    onError: aoErrar,
  })
  const assumir = useMutation({ mutationFn: assumirOrdem, onSuccess: refazer, onError: aoErrar })
  const concluir = useMutation({
    mutationFn: (p: {
      id: number
      retorno: RetornoTecnico
      comentario: string
      condicao?: CondicaoEncontrada
    }) => concluirOrdem(p.id, p.retorno, p.comentario, p.condicao),
    onSuccess: refazer,
    onError: aoErrar,
  })

  const pontos = useMemo(
    () => [...new Set((alarmes.data?.conteudo ?? []).map((a) => a.ponto))].sort(),
    [alarmes.data],
  )
  const visiveis = (alarmes.data?.conteudo ?? []).filter(
    (a) =>
      (filtroEstado === 'todos' || EM_ABERTO.has(a.estado)) &&
      (filtroPrioridade === 'todas' || a.prioridade === filtroPrioridade) &&
      (filtroPonto === 'todos' || a.ponto === filtroPonto),
  )
  const podeAgirNaOs = papel === 'ADMIN' || papel === 'TECNICO'

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-24 font-semibold">Alarmes e ordens de serviço</h1>
        {simulado ? <SeloSim /> : null}
      </header>
      <Painel className="lg:grid-cols-[3fr_2fr]">
        <Modulo
          rotulo="Alarmes"
          semRecuo
          acoes={
            <span className="flex items-center gap-1">
              <Explica chave="atencao_alarme" />
              <Explica chave="reconhecer" />
              <Explica chave="suprimido" />
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2">
            <ToggleGroup
              aria-label="Estado"
              value={[filtroEstado]}
              onValueChange={(v) => v[0] && setFiltroEstado(v[0] as FiltroEstado)}
            >
              <ToggleGroupItem value="abertos">Em aberto</ToggleGroupItem>
              <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup
              aria-label="Prioridade"
              value={[filtroPrioridade]}
              onValueChange={(v) => v[0] && setFiltroPrioridade(v[0] as FiltroPrioridade)}
            >
              <ToggleGroupItem value="todas">Toda prioridade</ToggleGroupItem>
              <ToggleGroupItem value="alta">Alta</ToggleGroupItem>
              <ToggleGroupItem value="baixa">Baixa</ToggleGroupItem>
            </ToggleGroup>
            <label className="flex items-center gap-1.5 text-13 text-apoio">
              Ponto
              <select
                value={filtroPonto}
                onChange={(e) => setFiltroPonto(e.target.value)}
                className="h-8 border border-linha-forte bg-modulo px-2 text-13 text-texto"
              >
                <option value="todos">todos</option>
                {pontos.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {alarmes.isPending ? (
            <EstadoCarregando />
          ) : alarmes.isError ? (
            <EstadoErro erro={alarmes.error} />
          ) : visiveis.length === 0 ? (
            <EstadoVazio titulo="Nenhum alarme com estes filtros.">
              Sem referência calculada, a API não chama nada de atenção ou alarme. Com referência,
              cada ponto que sair do normal por tempo suficiente aparece aqui, com a ação
              recomendada.
            </EstadoVazio>
          ) : (
            <ul aria-label="Lista de alarmes">
              {visiveis.map((a) => (
                <LinhaAlarme
                  key={a.id}
                  alarme={a}
                  aoReconhecer={(id) => reconhecer.mutate(id)}
                  aoSuprimir={
                    papel === 'ADMIN'
                      ? (id, motivo, minutos) => suprimir.mutate({ id, motivo, minutos })
                      : undefined
                  }
                  aoCancelarSupressao={papel === 'ADMIN' ? (id) => cancelar.mutate(id) : undefined}
                />
              ))}
            </ul>
          )}
        </Modulo>
        <Modulo rotulo="Ordens de serviço" semRecuo>
          {ordens.isPending ? (
            <EstadoCarregando />
          ) : ordens.isError ? (
            <EstadoErro erro={ordens.error} />
          ) : ordens.data.conteudo.length === 0 ? (
            <EstadoVazio titulo="Nenhuma ordem de serviço.">
              A OS abre sozinha quando um alarme de máquina fica ligado por tempo seguido ou quando
              a severidade acumulada do ponto passa do limite.
            </EstadoVazio>
          ) : (
            <ul aria-label="Lista de ordens de serviço">
              {ordens.data.conteudo.map((o) => (
                <LinhaOrdemServico
                  key={o.id}
                  ordem={o}
                  aoAssumir={podeAgirNaOs ? (id) => assumir.mutate(id) : undefined}
                  aoConcluir={
                    podeAgirNaOs
                      ? (id, retorno, comentario, condicao) =>
                          concluir.mutate({ id, retorno, comentario, condicao })
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </Modulo>
      </Painel>
    </div>
  )
}

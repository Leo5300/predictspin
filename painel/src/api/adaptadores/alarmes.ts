/**
 * ADAPTADOR ÚNICO de alarmes e ordens de serviço. As telas só conversam com este arquivo; ele chama
 * as rotas /api/v1/alertas e /api/v1/ordens-servico (contrato em painel/openapi.json). Real e
 * simulado nunca se misturam: toda consulta leva "simulado".
 */
import { queryOptions } from '@tanstack/react-query'

import { api, exigir } from '../cliente'
import type { components } from '../esquema'

export type Alarme = components['schemas']['AlertaResposta']
export type AlarmeDetalhe = components['schemas']['AlertaDetalheResposta']
export type EstadoAlarme = Alarme['estado']
export type OrdemServico = components['schemas']['OrdemServicoResposta']
export type RetornoTecnico = NonNullable<OrdemServico['retorno_tecnico']>

export const chavesAlarmes = {
  alarmes: (simulado: boolean) => ['alarmes', simulado] as const,
  alarme: (id: number) => ['alarme', id] as const,
  ordens: (simulado: boolean) => ['ordens-servico', simulado] as const,
}

/** Quantos itens a tela mostra de uma vez (não reconhecidos e em aberto vêm primeiro). */
const TAMANHO = 100

export function consultaAlarmes(simulado: boolean) {
  return queryOptions({
    queryKey: chavesAlarmes.alarmes(simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/alertas', { params: { query: { simulado, size: TAMANHO } }, signal }),
      ),
  })
}

export function consultaAlarme(id: number) {
  return queryOptions({
    queryKey: chavesAlarmes.alarme(id),
    queryFn: ({ signal }) =>
      exigir(api.GET('/api/v1/alertas/{id}', { params: { path: { id } }, signal })),
  })
}

export function consultaOrdensDeServico(simulado: boolean) {
  return queryOptions({
    queryKey: chavesAlarmes.ordens(simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/ordens-servico', {
          params: { query: { simulado, size: TAMANHO } },
          signal,
        }),
      ),
  })
}

/** "Eu vi": não apaga nem conserta nada. */
export function reconhecerAlarme(id: number): Promise<Alarme> {
  return exigir(api.POST('/api/v1/alertas/{id}/reconhecer', { params: { path: { id } } }))
}

/** Só ADMIN: motivo e prazo obrigatórios; volta sozinho ao fim do prazo. */
export function suprimirAlarme(id: number, motivo: string, minutos: number): Promise<Alarme> {
  return exigir(
    api.POST('/api/v1/alertas/{id}/suprimir', {
      params: { path: { id } },
      body: { motivo, minutos },
    }),
  )
}

export function cancelarSupressao(id: number): Promise<Alarme> {
  return exigir(api.POST('/api/v1/alertas/{id}/cancelar-supressao', { params: { path: { id } } }))
}

export function assumirOrdem(id: number): Promise<OrdemServico> {
  return exigir(api.POST('/api/v1/ordens-servico/{id}/assumir', { params: { path: { id } } }))
}

export function concluirOrdem(
  id: number,
  retorno: RetornoTecnico,
  comentario: string,
): Promise<OrdemServico> {
  return exigir(
    api.POST('/api/v1/ordens-servico/{id}/concluir', {
      params: { path: { id } },
      body: { retorno, comentario: comentario.trim() || undefined },
    }),
  )
}

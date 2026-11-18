/**
 * ADAPTADOR ÚNICO da referência e da avaliação: a faixa normal aprendida, a comparação da última
 * janela com ela, os limites em uso e o diagnóstico da regra de alarme. O painel nunca calcula
 * referência nem escreve limite à mão: tudo vem destas rotas.
 */
import { queryOptions } from '@tanstack/react-query'

import { api, exigir } from '../cliente'
import type { components } from '../esquema'

export type AvaliacaoDaMaquina = components['schemas']['AvaliacaoResposta']
export type PontoAvaliado = components['schemas']['PontoAvaliado']
export type MedidaAvaliada = components['schemas']['MedidaAvaliada']
export type Referencia = components['schemas']['ReferenciaResposta']
export type VersaoReferencia = components['schemas']['VersaoReferenciaResposta']
export type Limites = components['schemas']['LimitesResposta']
export type DiagnosticoAlarme = components['schemas']['DiagnosticoAlarmeResposta']

export const chavesReferencia = {
  avaliacao: (maquinaId: number, simulado: boolean) => ['avaliacao', maquinaId, simulado] as const,
  referencia: (maquinaId: number, simulado: boolean) =>
    ['referencia', maquinaId, simulado] as const,
  limites: () => ['limites'] as const,
  diagnostico: (maquinaId: number, simulado: boolean) =>
    ['diagnostico-alarme', maquinaId, simulado] as const,
}

/** Avaliação da janela mais recente: estado da máquina e de cada ponto, z, típico e explicação. */
export function consultaAvaliacao(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chavesReferencia.avaliacao(maquinaId, simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/avaliacao', {
          params: { path: { id: maquinaId }, query: { simulado } },
          signal,
        }),
      ),
  })
}

/** Referência em uso: versão, células e cobertura por marcha e etapa. */
export function consultaReferencia(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chavesReferencia.referencia(maquinaId, simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/referencias', {
          params: { path: { id: maquinaId }, query: { simulado } },
          signal,
        }),
      ),
  })
}

/** Limites em uso (PROPOSTA a confirmar); os textos do painel interpolam estes valores. */
export function consultaLimites() {
  return queryOptions({
    queryKey: chavesReferencia.limites(),
    queryFn: ({ signal }) => exigir(api.GET('/api/v1/alarmes/limites', { signal })),
    staleTime: 5 * 60_000,
  })
}

export function consultaDiagnosticoAlarme(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chavesReferencia.diagnostico(maquinaId, simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/alarmes/diagnostico', {
          params: { path: { id: maquinaId }, query: { simulado } },
          signal,
        }),
      ),
  })
}

/** Gera uma versão nova e imutável (ADMIN e TECNICO). */
export function recalcularReferencia(
  maquinaId: number,
  simulado: boolean,
): Promise<VersaoReferencia> {
  return exigir(
    api.POST('/api/v1/maquinas/{id}/referencias/recalcular', {
      params: { path: { id: maquinaId }, query: { simulado } },
    }),
  )
}

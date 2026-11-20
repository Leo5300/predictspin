/**
 * ADAPTADOR ÚNICO dos modelos de segunda opinião, do treino e da tendência. As telas só conversam com este
 * arquivo; ele chama as rotas /api/v1/maquinas/{id}/modelos, /modelos/{id}, /treino/trabalhos e
 * /maquinas/{id}/ia/diagnostico (contrato em painel/openapi.json). Real e simulado nunca se misturam.
 */
import { queryOptions } from '@tanstack/react-query'

import { api, exigir } from '../cliente'
import type { components } from '../esquema'

export type ModeloResumo = components['schemas']['ModeloResumo']
export type ModeloDetalhe = components['schemas']['ModeloDetalhe']
export type MetadadosModelo = components['schemas']['MetadadosModelo']
export type ValidacaoModelo = components['schemas']['ValidacaoModelo']
export type TrabalhoTreino = components['schemas']['TrabalhoTreino']
export type IaDiagnostico = components['schemas']['IaDiagnostico']
export type SegundaOpiniao = components['schemas']['SegundaOpiniao']
export type Tendencia = components['schemas']['Tendencia']
export type TreinoSse = components['schemas']['TreinoEvento']
export type ModeloSse = components['schemas']['ModeloEvento']

export const chavesModelos = {
  modelos: (maquinaId: number, simulado: boolean) => ['modelos', maquinaId, simulado] as const,
  modelo: (id: number) => ['modelo', id] as const,
  trabalhos: (maquinaId: number, simulado: boolean) => ['treino-trabalhos', maquinaId, simulado] as const,
  diagnostico: (maquinaId: number, simulado: boolean) => ['ia-diagnostico', maquinaId, simulado] as const,
  tendencia: (maquinaId: number, simulado: boolean) => ['tendencia', maquinaId, simulado] as const,
}

export function consultaModelos(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chavesModelos.modelos(maquinaId, simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/modelos', {
          params: { path: { id: maquinaId }, query: { simulado, size: 50 } },
          signal,
        }),
      ),
  })
}

export function consultaModelo(id: number) {
  return queryOptions({
    queryKey: chavesModelos.modelo(id),
    queryFn: ({ signal }) => exigir(api.GET('/api/v1/modelos/{id}', { params: { path: { id } }, signal })),
  })
}

export function consultaTrabalhos(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chavesModelos.trabalhos(maquinaId, simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/treino/trabalhos', {
          params: { path: { id: maquinaId }, query: { simulado, size: 5 } },
          signal,
        }),
      ),
  })
}

export function consultaDiagnosticoIa(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chavesModelos.diagnostico(maquinaId, simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/ia/diagnostico', {
          params: { path: { id: maquinaId }, query: { simulado } },
          signal,
        }),
      ),
    refetchInterval: 30_000,
  })
}

export function consultaTendencia(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chavesModelos.tendencia(maquinaId, simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/tendencia', {
          params: { path: { id: maquinaId }, query: { simulado } },
          signal,
        }),
      ),
  })
}

/** Botão Treinar (ADMIN e TECNICO): cria o trabalho; o progresso chega pelo evento "treino". */
export function treinar(maquinaId: number, simulado: boolean): Promise<TrabalhoTreino> {
  return exigir(
    api.POST('/api/v1/maquinas/{id}/modelos/treinar', {
      params: { path: { id: maquinaId }, query: { simulado } },
    }),
  )
}

/** Só ADMIN: a versão ativa anterior vira arquivada. */
export function ativarModelo(id: number): Promise<ModeloDetalhe> {
  return exigir(api.POST('/api/v1/modelos/{id}/ativar', { params: { path: { id } } }))
}

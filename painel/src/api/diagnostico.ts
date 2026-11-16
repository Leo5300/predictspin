/** Chamadas do Diagnóstico (L4): dispositivos, qualidade das janelas e usuários. */
import { queryOptions } from '@tanstack/react-query'

import { api, exigir } from './cliente'
import type { components } from './esquema'

export type NovoUsuario = components['schemas']['NovoUsuarioRequisicao']

/** Todos os dispositivos da máquina, reais e simulados (o selo diz qual é qual). */
export function consultaTodosOsDispositivos(maquinaId: number) {
  return queryOptions({
    queryKey: ['dispositivos-todos', maquinaId] as const,
    queryFn: async ({ signal }) =>
      (
        await exigir(
          api.GET('/api/v1/maquinas/{id}/dispositivos', {
            params: { path: { id: maquinaId }, query: { size: 50 } },
            signal,
          }),
        )
      ).conteudo,
    refetchInterval: 30_000,
  })
}

export const JANELAS_DA_QUALIDADE = 20

/** As últimas janelas da fonte, da mais nova para a mais antiga. */
export function consultaQualidade(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: ['qualidade', maquinaId, simulado] as const,
    queryFn: async ({ signal }) =>
      (
        await exigir(
          api.GET('/api/v1/maquinas/{id}/janelas', {
            params: {
              path: { id: maquinaId },
              query: { simulado, ordem: 'desc', size: JANELAS_DA_QUALIDADE },
            },
            signal,
          }),
        )
      ).conteudo,
    refetchInterval: 15_000,
  })
}

export function consultaUsuarios() {
  return queryOptions({
    queryKey: ['usuarios'] as const,
    queryFn: async ({ signal }) =>
      (await exigir(api.GET('/api/v1/usuarios', { params: { query: { size: 200 } }, signal })))
        .conteudo,
  })
}

export function criarUsuario(corpo: NovoUsuario) {
  return exigir(api.POST('/api/v1/usuarios', { body: corpo }))
}

export function desativarUsuario(id: number) {
  return exigir(api.POST('/api/v1/usuarios/{id}/desativar', { params: { path: { id } } }))
}

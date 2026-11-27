/**
 * Barra de demonstração: estado e troca de nível. As rotas só existem com PS_DEMO_HABILITADO na API e só
 * respondem a ADMIN; fora disso o estado vem como "desligada" (nulo) e a barra nem aparece.
 */
import { queryOptions } from '@tanstack/react-query'

import type { NivelDemo } from '@/dominio/demonstracao'

import { api, exigir } from './cliente'
import { ehNaoEncontrado, ehSemPermissao } from './erros'
import type { components } from './esquema'

export type EstadoDemo = components['schemas']['EstadoDemoResposta']

export const INTERVALO_DEMO_MS = 5000

export const chaveDoEstadoDemo = ['demo', 'estado'] as const

/** Estado da demonstração; nulo quando ela está desligada neste ambiente (404) ou o usuário não é ADMIN. */
export function consultaEstadoDemo() {
  return queryOptions({
    queryKey: chaveDoEstadoDemo,
    queryFn: async ({ signal }): Promise<EstadoDemo | null> => {
      try {
        return await exigir(api.GET('/api/v1/demo/estado', { signal }))
      } catch (erro) {
        if (ehNaoEncontrado(erro) || ehSemPermissao(erro)) return null
        throw erro
      }
    },
    retry: false,
    // nulo = desligada ou sem permissão: não adianta perguntar de novo. Erro passageiro (API acordando) ou dado
    // presente: continua perguntando, e a barra aparece sozinha quando a API responder
    refetchInterval: (consulta) => (consulta.state.data === null ? false : INTERVALO_DEMO_MS),
    staleTime: 0,
  })
}

/** Para a demonstração e apaga alertas, OS, estado dos pontos e severidade SIMULADOS (não se desfaz). */
export function zerarDemonstracao(): Promise<EstadoDemo> {
  return exigir(api.POST('/api/v1/demo/zerar'))
}

export function trocarCenario(nivel: NivelDemo): Promise<EstadoDemo> {
  return exigir(api.POST('/api/v1/demo/cenario', { body: { nivel } }))
}

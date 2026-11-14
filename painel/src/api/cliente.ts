/**
 * Cliente da API, tipado pelo contrato (esquema.d.ts). Acrescenta o token, encerra a sessão em
 * qualquer 401 e informa a saúde da conexão a cada chamada.
 */
import createClient from 'openapi-fetch'

import { DEMORA_SUSPEITA_S, statusDeApiAcordando } from '@/dominio/conexao'

import { ErroApi, ErroRede, lerRetryAfter } from './erros'
import type { paths } from './esquema'
import { configurarSonda, registrarDemora, registrarFalha, registrarSucesso } from './saude'
import { encerrarSessao, tokenAtual } from './sessao'
import type { ErroResposta } from './tipos'

export const URL_API = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080'
).replace(/\/+$/, '')

export const ROTA_LOGIN = '/api/v1/auth/login'
export const AVISO_SESSAO_EXPIRADA = 'Sua sessão expirou. Entre novamente.'

configurarSonda(URL_API)

async function buscar(requisicao: Request): Promise<Response> {
  const demora = setTimeout(registrarDemora, DEMORA_SUSPEITA_S * 1000)
  let resposta: Response
  try {
    resposta = await fetch(requisicao)
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro
    registrarFalha()
    throw new ErroRede()
  } finally {
    clearTimeout(demora)
  }
  if (
    statusDeApiAcordando(resposta.status) &&
    !resposta.headers.get('Content-Type')?.includes('json')
  ) {
    // 502/503/504 sem corpo da API: é o proxy, com o serviço ainda subindo
    registrarFalha()
    throw new ErroRede('A API está iniciando.')
  }
  registrarSucesso()
  return resposta
}

export const api = createClient<paths>({ baseUrl: URL_API, fetch: buscar })

api.use({
  onRequest({ request }) {
    const token = tokenAtual()
    if (token && !request.url.endsWith(ROTA_LOGIN)) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  onResponse({ request, response }) {
    if (response.status === 401 && !request.url.endsWith(ROTA_LOGIN)) {
      encerrarSessao(AVISO_SESSAO_EXPIRADA)
    }
    return response
  },
})

type Resultado<T> = { data?: T; error?: unknown; response: Response }

/** Devolve o corpo de uma resposta 2xx ou lança ErroApi com a mensagem e os campos da API. */
export async function exigir<T>(chamada: Promise<Resultado<T>>): Promise<T> {
  const { data, error, response } = await chamada
  if (!response.ok || data === undefined) {
    throw new ErroApi(response.status, erroDaApi(error), lerRetryAfter(response))
  }
  return data
}

function erroDaApi(corpo: unknown): Partial<ErroResposta> | null {
  return typeof corpo === 'object' && corpo !== null ? corpo : null
}

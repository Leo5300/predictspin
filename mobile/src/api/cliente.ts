/**
 * Cliente da API, tipado pelo contrato (esquema.d.ts gerado de painel/openapi.json). Acrescenta o
 * token no cabeçalho Authorization, encerra a sessão em qualquer 401, limita o tempo de cada chamada
 * e informa a saúde da conexão.
 */
import createClient from 'openapi-fetch'

import {
  DEMORA_SUSPEITA_S,
  TEMPO_MAXIMO_DA_CHAMADA_S,
  statusDeApiAcordando,
} from '@/dominio/conexao'

import { URL_API } from './configuracao'
import { ErroApi, ErroRede, lerRetryAfter } from './erros'
import type { paths } from './esquema'
import { obterSaude, registrarFalha, registrarSucesso } from './saude'
import { AVISO_SESSAO_EXPIRADA, encerrarSessao, tokenAtual } from './sessao'
import type { ErroResposta } from './tipos'

export const ROTA_LOGIN = '/api/v1/auth/login'

/**
 * O openapi-fetch entrega um Request; aqui ele vira url + opções, que qualquer fetch aceita (o do
 * Expo no celular, o do Node nos testes).
 */
async function buscar(requisicao: Request): Promise<Response> {
  const controle = new AbortController()
  const externo = requisicao.signal
  const repassar = () => controle.abort()
  externo?.addEventListener('abort', repassar)
  let esgotou = false
  const limite = setTimeout(() => {
    esgotou = true
    controle.abort()
  }, TEMPO_MAXIMO_DA_CHAMADA_S * 1000)
  // resposta lenta já indica a API acordando: a barra avisa antes do erro
  const demora = setTimeout(registrarFalha, DEMORA_SUSPEITA_S * 1000)
  let resposta: Response
  try {
    const metodo = requisicao.method.toUpperCase()
    const corpo = metodo === 'GET' || metodo === 'HEAD' ? '' : await requisicao.text()
    const cabecalhos: Record<string, string> = {}
    requisicao.headers.forEach((valor, nome) => {
      cabecalhos[nome] = valor
    })
    resposta = await fetch(requisicao.url, {
      method: metodo,
      headers: cabecalhos,
      body: corpo || undefined,
      signal: controle.signal,
    })
  } catch (erro) {
    // consulta cancelada por quem chamou (troca de tela): não é falha de rede
    if (externo?.aborted && !esgotou) throw erro
    registrarFalha()
    throw new ErroRede(obterSaude().aparelhoConectado)
  } finally {
    clearTimeout(limite)
    clearTimeout(demora)
    externo?.removeEventListener('abort', repassar)
  }
  if (
    statusDeApiAcordando(resposta.status) &&
    !resposta.headers.get('Content-Type')?.includes('json')
  ) {
    // 502/503/504 sem corpo da API: é o proxy do Render, com o serviço ainda subindo
    registrarFalha()
    throw new ErroRede(true)
  }
  registrarSucesso()
  return resposta
}

export const api = createClient<paths>({ baseUrl: URL_API, fetch: buscar })

api.use({
  onRequest({ request }) {
    const token = tokenAtual()
    if (token && !request.url.endsWith(ROTA_LOGIN) && !request.headers.has('Authorization')) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  onResponse({ request, response }) {
    if (response.status === 401 && !request.url.endsWith(ROTA_LOGIN)) {
      void encerrarSessao(AVISO_SESSAO_EXPIRADA)
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

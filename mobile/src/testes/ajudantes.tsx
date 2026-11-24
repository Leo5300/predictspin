/**
 * Ajudantes dos testes: uma API simulada no fetch global (rota por método e caminho) e a montagem de
 * telas com um QueryClient novo.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react-native'
import type { ReactElement } from 'react'

export type Rota = (pedido: { url: URL; corpo: unknown; cabecalhos: Headers }) =>
  | { status?: number; corpo?: unknown; cabecalhos?: Record<string, string> }
  | Promise<{ status?: number; corpo?: unknown; cabecalhos?: Record<string, string> }>

/**
 * Troca o fetch global por uma API em memória. A chave é "MÉTODO /caminho" (sem a consulta); rota
 * não cadastrada responde 404. Devolve a lista de pedidos feitos, para conferir.
 */
export function simularApi(rotas: Record<string, Rota>) {
  const pedidos: { metodo: string; caminho: string; url: URL; corpo: unknown; cabecalhos: Headers }[] = []
  const fetchSimulado = jest.fn(async (entrada: string | URL | Request, opcoes?: RequestInit) => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url)
    const metodo = (opcoes?.method ?? 'GET').toUpperCase()
    const cabecalhos = new Headers(opcoes?.headers)
    const corpo = typeof opcoes?.body === 'string' && opcoes.body ? JSON.parse(opcoes.body) : null
    pedidos.push({ metodo, caminho: url.pathname, url, corpo, cabecalhos })
    const rota = rotas[`${metodo} ${url.pathname}`]
    if (!rota) {
      return new Response(JSON.stringify({ status: 404, erro: 'Not Found', mensagem: 'Não encontrado.', caminho: url.pathname, timestamp: '' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const resposta = await rota({ url, corpo, cabecalhos })
    const status = resposta.status ?? 200
    return new Response(resposta.corpo === undefined ? null : JSON.stringify(resposta.corpo), {
      status,
      headers: { 'Content-Type': 'application/json', ...resposta.cabecalhos },
    })
  })
  global.fetch = fetchSimulado as unknown as typeof fetch
  return { pedidos, fetchSimulado }
}

export function erroDaApi(status: number, mensagem: string) {
  return { status, corpo: { status, erro: 'erro', mensagem, caminho: '', timestamp: '' } }
}

export function novoCliente() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  })
}

export async function montar(ui: ReactElement, cliente = novoCliente()) {
  const resultado = await render(<QueryClientProvider client={cliente}>{ui}</QueryClientProvider>)
  return { cliente, ...resultado }
}

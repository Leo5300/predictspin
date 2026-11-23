import { formatarEspera } from '@/dominio/formato'

import type { ErroResposta } from './tipos'

/**
 * Erro devolvido pela API (ErroResposta). A tela mostra a mensagem e os campos; detalhe interno
 * nunca chega aqui porque a API não o envia.
 */
export class ErroApi extends Error {
  readonly status: number
  readonly campos: { campo: string; mensagem: string }[]
  /** Segundos indicados em Retry-After (login bloqueado, limite de conexões). */
  readonly esperarS: number | null

  constructor(status: number, corpo: Partial<ErroResposta> | null, esperarS: number | null = null) {
    super(corpo?.mensagem ?? mensagemPadrao(status))
    this.name = 'ErroApi'
    this.status = status
    this.campos = (corpo?.campos ?? []).map((c) => ({ campo: c.campo, mensagem: c.mensagem }))
    this.esperarS = esperarS
  }
}

/** A requisição não chegou à API: sem rede, tempo esgotado ou servidor ainda subindo. */
export class ErroRede extends Error {
  /** true quando o aparelho tem rede: o mais provável é a API do Render acordando. */
  readonly acordando: boolean

  constructor(acordando: boolean, mensagem?: string) {
    super(
      mensagem ??
        (acordando
          ? 'Acordando o servidor, aguarde. Depois de um tempo parado ele leva cerca de 1 minuto para responder.'
          : 'Sem conexão. Confira o Wi-Fi ou os dados móveis do celular.'),
    )
    this.name = 'ErroRede'
    this.acordando = acordando
  }
}

function mensagemPadrao(status: number): string {
  if (status === 401) return 'Sessão encerrada. Entre novamente.'
  if (status === 403) return 'Seu papel não permite esta ação. A API recusou o pedido.'
  if (status === 404) return 'Não encontrado.'
  if (status === 409) return 'A situação mudou enquanto você agia. Atualize e tente de novo.'
  if (status === 429) return 'Muitas tentativas. Aguarde antes de tentar de novo.'
  return 'A API respondeu com erro.'
}

export function lerRetryAfter(resposta: { headers: { get(nome: string): string | null } }): number | null {
  const valor = resposta.headers.get('Retry-After')
  if (!valor) return null
  const segundos = Number(valor)
  return Number.isFinite(segundos) && segundos >= 0 ? segundos : null
}

/** Texto para mostrar a partir de qualquer erro de chamada. */
export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroApi) {
    if (erro.status === 403) return mensagemPadrao(403)
    if (erro.status === 429 && erro.esperarS !== null)
      return `Muitas tentativas. Tente de novo em ${formatarEspera(erro.esperarS)}.`
    return erro.message
  }
  if (erro instanceof ErroRede) return erro.message
  return 'Algo saiu errado. Tente novamente.'
}

export function ehSemPermissao(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 403
}

export function ehNaoEncontrado(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 404
}

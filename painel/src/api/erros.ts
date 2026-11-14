import type { ErroResposta } from './tipos'

/**
 * Erro devolvido pela API (ErroResposta). A interface mostra a mensagem e os campos; detalhe
 * interno nunca chega aqui porque a API não o envia.
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

/** A requisição não chegou à API: sem rede, API hibernando ou proxy ainda subindo o serviço. */
export class ErroRede extends Error {
  constructor(mensagem = 'Não foi possível falar com a API.') {
    super(mensagem)
    this.name = 'ErroRede'
  }
}

function mensagemPadrao(status: number): string {
  if (status === 401) return 'Sessão encerrada. Entre novamente.'
  if (status === 403) return 'Sem permissão para esta operação.'
  if (status === 404) return 'Não encontrado.'
  if (status === 429) return 'Muitas tentativas. Aguarde antes de tentar de novo.'
  return 'A API respondeu com erro.'
}

export function lerRetryAfter(resposta: Response): number | null {
  const valor = resposta.headers.get('Retry-After')
  if (!valor) return null
  const segundos = Number(valor)
  return Number.isFinite(segundos) && segundos >= 0 ? segundos : null
}

/** Texto para mostrar ao usuário a partir de qualquer erro de chamada. */
export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroApi || erro instanceof ErroRede) return erro.message
  return 'Algo saiu errado. Tente novamente.'
}

export function ehSemPermissao(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 403
}

export function ehNaoEncontrado(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 404
}

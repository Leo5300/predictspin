import { api, exigir } from './cliente'
import { ErroApi } from './erros'
import { confirmarSessao, encerrarSessao, iniciarSessao, tokenGuardado } from './sessao'

/** Entra com e-mail e senha. Erros (401, 429 com Retry-After, rede) sobem para a tela tratar. */
export async function entrar(email: string, senha: string): Promise<void> {
  const resposta = await exigir(api.POST('/api/v1/auth/login', { body: { email, senha } }))
  iniciarSessao(resposta)
}

/**
 * Ao abrir o painel: se há token guardado nesta aba, confere com a API quem é o dono. Token
 * recusado encerra a sessão; falha de rede deixa a sessão "verificando" para tentar de novo.
 */
export async function validarSessaoAoAbrir(): Promise<void> {
  const guardado = tokenGuardado()
  if (!guardado) {
    encerrarSessao()
    return
  }
  try {
    const usuario = await exigir(
      api.GET('/api/v1/auth/eu', { headers: { Authorization: `Bearer ${guardado.token}` } }),
    )
    confirmarSessao(usuario, guardado)
  } catch (erro) {
    if (erro instanceof ErroApi) {
      encerrarSessao(erro.status === 401 ? 'Sua sessão expirou. Entre novamente.' : null)
      return
    }
    throw erro
  }
}

export function sair() {
  encerrarSessao()
}

/**
 * Entrar, abrir o app com a sessão guardada, destravar com biometria e sair.
 */
import { apagar, CHAVES, gravar, ler } from './armazenamento'
import {
  autenticarComBiometria,
  biometriaDisponivel,
  esquecerPreferenciaBiometria,
  lerPreferenciaBiometria,
} from './biometria'
import { api, exigir } from './cliente'
import { ErroApi } from './erros'
import {
  AVISO_SESSAO_EXPIRADA,
  confirmarSessao,
  encerrarSessao,
  iniciarSessao,
  lerGuardado,
  travarSessao,
  venceu,
  type Guardado,
} from './sessao'

export type ResultadoDaEntrada = {
  /** Primeiro login com biometria no aparelho e a pergunta ainda não feita. */
  perguntarBiometria: boolean
}

/** Entra com e-mail e senha. Erros (401, 429 com Retry-After, rede) sobem para a tela tratar. */
export async function entrar(email: string, senha: string): Promise<ResultadoDaEntrada> {
  const resposta = await exigir(api.POST('/api/v1/auth/login', { body: { email, senha } }))
  await iniciarSessao(resposta)
  // só o e-mail é lembrado, para preencher a próxima entrada; a senha nunca é guardada
  await gravar(CHAVES.email, email)
  const perguntarBiometria =
    (await lerPreferenciaBiometria()) === null && (await biometriaDisponivel())
  return { perguntarBiometria }
}

export async function emailLembrado(): Promise<string> {
  return (await ler(CHAVES.email)) ?? ''
}

/** Confere com a API de quem é o token guardado. 401 encerra; falha de rede sobe para nova tentativa. */
async function validar(guardado: Guardado): Promise<void> {
  try {
    const usuario = await exigir(
      api.GET('/api/v1/auth/eu', { headers: { Authorization: `Bearer ${guardado.token}` } }),
    )
    confirmarSessao(usuario, guardado)
  } catch (erro) {
    if (erro instanceof ErroApi) {
      await encerrarSessao(erro.status === 401 ? AVISO_SESSAO_EXPIRADA : null)
      return
    }
    throw erro
  }
}

/**
 * Ao abrir o app: sem token, tela de entrada; token vencido, tela de entrada com aviso; biometria
 * ligada e disponível, sessão travada até destravar; senão confere o token com a API.
 */
export async function abrirSessaoGuardada(agoraMs = Date.now()): Promise<void> {
  const guardado = await lerGuardado()
  if (!guardado) {
    await encerrarSessao(null)
    return
  }
  if (venceu(guardado, agoraMs)) {
    await encerrarSessao(AVISO_SESSAO_EXPIRADA)
    return
  }
  if ((await lerPreferenciaBiometria()) === 'ligada' && (await biometriaDisponivel())) {
    travarSessao()
    return
  }
  await validar(guardado)
}

/** Pede a biometria e, se ela passar, confere o token guardado. Devolve se destravou. */
export async function destravar(agoraMs = Date.now()): Promise<boolean> {
  const guardado = await lerGuardado()
  if (!guardado || venceu(guardado, agoraMs)) {
    await encerrarSessao(guardado ? AVISO_SESSAO_EXPIRADA : null)
    return false
  }
  if (!(await autenticarComBiometria())) return false
  await validar(guardado)
  return true
}

/**
 * Sair: apaga o token e a preferência de biometria do aparelho e limpa o cache das consultas
 * (aoEncerrarSessao). Ficam só o e-mail lembrado e o tema escolhido.
 */
export async function sair(): Promise<void> {
  await esquecerPreferenciaBiometria()
  await encerrarSessao(null)
}

/** Esquece também o e-mail (opção da tela de entrada). */
export async function esquecerEmail(): Promise<void> {
  await apagar(CHAVES.email)
}

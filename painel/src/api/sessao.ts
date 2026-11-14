/**
 * Sessão do usuário. O token fica em memória e em sessionStorage (some ao fechar a aba).
 *
 * Por que não é cookie: no Render a API e o painel ficam em domínios diferentes. Um cookie de
 * sessão seria de terceiros (SameSite=None), que os navegadores bloqueiam ou restringem, e abriria
 * a porta para CSRF. Com o token no cabeçalho Authorization nada é enviado sozinho pelo navegador.
 */
import { useSyncExternalStore } from 'react'

import type { RespostaLogin, Usuario } from './tipos'

const CHAVE = 'ps.sessao'

export type Sessao =
  | { fase: 'verificando' }
  | { fase: 'anonima'; aviso: string | null }
  | { fase: 'autenticada'; usuario: Usuario; token: string; expiraEm: string }

type Guardado = { token: string; expira_em: string }

let sessao: Sessao = { fase: 'verificando' }
const ouvintes = new Set<() => void>()

function publicar(nova: Sessao) {
  sessao = nova
  ouvintes.forEach((ouvinte) => ouvinte())
}

function ler(): Guardado | null {
  try {
    const texto = sessionStorage.getItem(CHAVE)
    if (!texto) return null
    const valor: unknown = JSON.parse(texto)
    if (
      typeof valor === 'object' &&
      valor !== null &&
      'token' in valor &&
      'expira_em' in valor &&
      typeof valor.token === 'string' &&
      typeof valor.expira_em === 'string'
    ) {
      return { token: valor.token, expira_em: valor.expira_em }
    }
  } catch {
    /* armazenamento indisponível ou conteúdo inválido: segue sem sessão */
  }
  return null
}

function gravar(valor: Guardado | null) {
  try {
    if (valor) sessionStorage.setItem(CHAVE, JSON.stringify(valor))
    else sessionStorage.removeItem(CHAVE)
  } catch {
    /* sem armazenamento a sessão vive só em memória */
  }
}

export function obterSessao(): Sessao {
  return sessao
}

export function assinarSessao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function useSessao(): Sessao {
  return useSyncExternalStore(assinarSessao, obterSessao)
}

/** Token guardado de uma sessão anterior desta aba, ainda não validado; nulo se não há ou venceu. */
export function tokenGuardado(): Guardado | null {
  const guardado = ler()
  if (!guardado) return null
  if (Date.parse(guardado.expira_em) <= Date.now()) {
    gravar(null)
    return null
  }
  return guardado
}

/** Token da sessão em curso, para o cabeçalho Authorization. */
export function tokenAtual(): string | null {
  return sessao.fase === 'autenticada' ? sessao.token : null
}

export function iniciarSessao(resposta: RespostaLogin) {
  gravar({ token: resposta.token, expira_em: resposta.expira_em })
  publicar({
    fase: 'autenticada',
    usuario: resposta.usuario,
    token: resposta.token,
    expiraEm: resposta.expira_em,
  })
}

export function confirmarSessao(usuario: Usuario, guardado: Guardado) {
  publicar({ fase: 'autenticada', usuario, token: guardado.token, expiraEm: guardado.expira_em })
}

/** Limpa tudo. O aviso aparece na tela de login (sessão expirada, por exemplo). */
export function encerrarSessao(aviso: string | null = null) {
  gravar(null)
  if (sessao.fase === 'anonima' && sessao.aviso === aviso) return
  publicar({ fase: 'anonima', aviso })
}

/** Só para testes: volta ao estado inicial. */
export function reiniciarSessaoParaTeste() {
  gravar(null)
  sessao = { fase: 'verificando' }
}

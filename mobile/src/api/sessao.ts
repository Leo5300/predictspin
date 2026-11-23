/**
 * Sessão do usuário. O token JWT e a hora em que vence ficam no SecureStore (Keychain/Keystore);
 * em memória fica a sessão em curso. Token nunca vai para log nem para a URL.
 *
 * Fases: verificando (abrindo o app), anônima (tela de entrada, com aviso opcional), travada (há
 * token guardado e a biometria está ligada: falta destravar) e autenticada.
 */
import { useSyncExternalStore } from 'react'

import { apagar, CHAVES, gravar, ler } from './armazenamento'
import type { RespostaLogin, Usuario } from './tipos'

export const AVISO_SESSAO_EXPIRADA = 'Sua sessão expirou. Entre novamente.'

export type Guardado = { token: string; expira_em: string }

export type Sessao =
  | { fase: 'verificando' }
  | { fase: 'anonima'; aviso: string | null }
  | { fase: 'travada' }
  | { fase: 'autenticada'; usuario: Usuario; token: string; expiraEm: string }

let sessao: Sessao = { fase: 'verificando' }
const ouvintes = new Set<() => void>()
const aoEncerrar = new Set<() => void>()
let vencimento: ReturnType<typeof setTimeout> | null = null

/** setTimeout aceita no máximo ~24,8 dias; o token da API vale 1 dia. */
const MAIOR_ESPERA_MS = 2_000_000_000

function publicar(nova: Sessao) {
  sessao = nova
  ouvintes.forEach((ouvinte) => ouvinte())
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

/** Para limpar o que depende da sessão (o cache das consultas, por exemplo) ao encerrar. */
export function aoEncerrarSessao(ouvinte: () => void): () => void {
  aoEncerrar.add(ouvinte)
  return () => aoEncerrar.delete(ouvinte)
}

export function venceu(guardado: Guardado, agoraMs: number): boolean {
  const fim = Date.parse(guardado.expira_em)
  return !Number.isFinite(fim) || fim <= agoraMs
}

/** Token guardado de uma sessão anterior (pode estar vencido); nulo se não há ou está corrompido. */
export async function lerGuardado(): Promise<Guardado | null> {
  const texto = await ler(CHAVES.sessao)
  if (!texto) return null
  try {
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
    /* conteúdo inválido: segue sem sessão */
  }
  await apagar(CHAVES.sessao)
  return null
}

/** Token da sessão em curso, para o cabeçalho Authorization. */
export function tokenAtual(): string | null {
  return sessao.fase === 'autenticada' ? sessao.token : null
}

function vigiarVencimento(expiraEm: string) {
  if (vencimento) clearTimeout(vencimento)
  const falta = Date.parse(expiraEm) - Date.now()
  vencimento = setTimeout(
    () => void encerrarSessao(AVISO_SESSAO_EXPIRADA),
    Math.min(Math.max(0, falta), MAIOR_ESPERA_MS),
  )
}

export async function iniciarSessao(resposta: RespostaLogin): Promise<void> {
  await gravar(
    CHAVES.sessao,
    JSON.stringify({ token: resposta.token, expira_em: resposta.expira_em }),
  )
  confirmarSessao(resposta.usuario, { token: resposta.token, expira_em: resposta.expira_em })
}

export function confirmarSessao(usuario: Usuario, guardado: Guardado) {
  vigiarVencimento(guardado.expira_em)
  publicar({ fase: 'autenticada', usuario, token: guardado.token, expiraEm: guardado.expira_em })
}

export function travarSessao() {
  publicar({ fase: 'travada' })
}

/** Apaga o token do aparelho e o que depende da sessão. O aviso aparece na tela de entrada. */
export async function encerrarSessao(aviso: string | null = null): Promise<void> {
  if (vencimento) clearTimeout(vencimento)
  vencimento = null
  const jaAnonima = sessao.fase === 'anonima' && sessao.aviso === aviso
  if (!jaAnonima) publicar({ fase: 'anonima', aviso })
  aoEncerrar.forEach((ouvinte) => ouvinte())
  await apagar(CHAVES.sessao)
}

/** Só para testes: volta ao estado inicial. */
export function reiniciarSessaoParaTeste() {
  if (vencimento) clearTimeout(vencimento)
  vencimento = null
  sessao = { fase: 'verificando' }
  ouvintes.clear()
  aoEncerrar.clear()
}

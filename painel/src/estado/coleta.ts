/**
 * Estado da Coleta guardado no navegador: a sessão encadeada (recarregar não perde) e a meta de
 * ensaios por célula da cobertura (a API recebe a meta por consulta; padrão 3).
 */
import { useSyncExternalStore } from 'react'

import { gravarSessao, lerSessao, type Sessao } from '@/dominio/sessao'

const CHAVE_META = 'ps.meta-coleta'
export const META_PADRAO = 3

function armazenamento(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

let sessao: Sessao | null = lerSessao(armazenamento())
let meta = lerMeta()
const ouvintes = new Set<() => void>()

function lerMeta(): number {
  try {
    const n = Number(window.localStorage.getItem(CHAVE_META))
    return Number.isInteger(n) && n >= 1 && n <= 20 ? n : META_PADRAO
  } catch {
    return META_PADRAO
  }
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

function avisar() {
  ouvintes.forEach((o) => o())
}

export function useSessaoDeColeta(): Sessao | null {
  return useSyncExternalStore(assinar, () => sessao)
}

export function obterSessaoDeColeta(): Sessao | null {
  return sessao
}

export function definirSessaoDeColeta(nova: Sessao | null) {
  sessao = nova
  gravarSessao(armazenamento(), nova)
  avisar()
}

export function obterMetaDaColeta(): number {
  return meta
}

export function useMetaDaColeta(): number {
  return useSyncExternalStore(assinar, () => meta)
}

export function definirMetaDaColeta(nova: number) {
  meta = Math.min(20, Math.max(1, Math.round(nova)))
  try {
    window.localStorage.setItem(CHAVE_META, String(meta))
  } catch {
    /* sem armazenamento, vale até recarregar */
  }
  avisar()
}

/**
 * Preferências guardadas no navegador: a fonte dos dados (Real, o padrão, ou Simulado) e o tema
 * (claro "cinza ISA", o padrão, ou escuro "grafite").
 */
import { useSyncExternalStore } from 'react'

export type Fonte = 'real' | 'simulado'
export type Tema = 'claro' | 'grafite'

const CHAVE_FONTE = 'ps.fonte'
const CHAVE_TEMA = 'ps.tema'

/** Cor de fundo de cada tema, para a barra do navegador no celular (igual a --superficie-fundo). */
const COR_DO_NAVEGADOR: Record<Tema, string> = { claro: '#d1d1d1', grafite: '#191919' }

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    /* sem armazenamento a escolha vale só até recarregar */
  }
}

let fonte: Fonte = ler(CHAVE_FONTE) === 'simulado' ? 'simulado' : 'real'
let tema: Tema = ler(CHAVE_TEMA) === 'grafite' ? 'grafite' : 'claro'

const ouvintes = new Set<() => void>()

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

function avisar() {
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function useFonte(): Fonte {
  return useSyncExternalStore(assinar, () => fonte)
}

export function definirFonte(nova: Fonte) {
  if (nova === fonte) return
  fonte = nova
  gravar(CHAVE_FONTE, nova)
  avisar()
}

export function useTema(): Tema {
  return useSyncExternalStore(assinar, () => tema)
}

export function obterTema(): Tema {
  return tema
}

export function aplicarTema(novo: Tema) {
  document.documentElement.dataset.theme = novo
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', COR_DO_NAVEGADOR[novo])
}

export function definirTema(novo: Tema) {
  if (novo === tema) return
  tema = novo
  gravar(CHAVE_TEMA, novo)
  aplicarTema(novo)
  avisar()
}

/** Avisa quando o tema muda (os gráficos em canvas releem as cores). */
export function aoMudarTema(ouvinte: () => void): () => void {
  return assinar(ouvinte)
}

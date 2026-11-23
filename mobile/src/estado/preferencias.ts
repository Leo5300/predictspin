/**
 * Preferências do app: o tema (segue o sistema, claro ou escuro; guardado no aparelho) e a fonte dos
 * dados (Real, o padrão, ou Simulado; só em memória: o app nunca abre mostrando dado simulado como
 * se fosse o normal).
 */
import { useSyncExternalStore } from 'react'
import { Uniwind } from 'uniwind'

import { CHAVES, gravar, ler } from '@/api/armazenamento'

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro'
export type Fonte = 'real' | 'simulado'

let tema: PreferenciaTema = 'sistema'
let fonte: Fonte = 'real'
const ouvintes = new Set<() => void>()

function avisar() {
  ouvintes.forEach((ouvinte) => ouvinte())
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

/** light = claro "cinza ISA"; dark = escuro "grafite" (nomes de tema do Uniwind). */
function aplicarTema(preferencia: PreferenciaTema) {
  Uniwind.setTheme(preferencia === 'claro' ? 'light' : preferencia === 'escuro' ? 'dark' : 'system')
}

export function usePreferenciaTema(): PreferenciaTema {
  return useSyncExternalStore(assinar, () => tema)
}

export function useFonte(): Fonte {
  return useSyncExternalStore(assinar, () => fonte)
}

export function obterFonte(): Fonte {
  return fonte
}

export async function carregarTema(): Promise<void> {
  const guardado = await ler(CHAVES.tema)
  tema = guardado === 'claro' || guardado === 'escuro' ? guardado : 'sistema'
  aplicarTema(tema)
  avisar()
}

export async function definirTema(novo: PreferenciaTema): Promise<void> {
  tema = novo
  aplicarTema(novo)
  avisar()
  await gravar(CHAVES.tema, novo)
}

export function definirFonte(nova: Fonte) {
  if (nova === fonte) return
  fonte = nova
  avisar()
}

/** Só para testes. */
export function reiniciarPreferenciasParaTeste() {
  tema = 'sistema'
  fonte = 'real'
}

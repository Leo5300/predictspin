/**
 * Aviso curto no topo da tela (alarme novo, ação recusada, sessão encerrada). Some sozinho; também
 * é anunciado ao leitor de tela. Sem som: o celular fica na oficina, e o aviso não substitui o painel.
 */
import { useSyncExternalStore } from 'react'
import { AccessibilityInfo } from 'react-native'

export type Aviso = { id: number; texto: string }

const DURACAO_MS = 5000

let aviso: Aviso | null = null
let proximo = 1
let temporizador: ReturnType<typeof setTimeout> | null = null
const ouvintes = new Set<() => void>()

function publicar(novo: Aviso | null) {
  aviso = novo
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function avisar(texto: string) {
  if (temporizador) clearTimeout(temporizador)
  publicar({ id: proximo++, texto })
  AccessibilityInfo.announceForAccessibility(texto)
  temporizador = setTimeout(() => publicar(null), DURACAO_MS)
}

export function dispensarAviso() {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  publicar(null)
}

export function useAviso(): Aviso | null {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    () => aviso,
  )
}

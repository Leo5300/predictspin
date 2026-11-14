import { useSyncExternalStore } from 'react'

const CONSULTA = '(width < 40rem)'

function assinar(avisar: () => void) {
  const lista = window.matchMedia(CONSULTA)
  lista.addEventListener('change', avisar)
  return () => lista.removeEventListener('change', avisar)
}

/** Tela de celular (menos de 40rem): menos detalhe onde o espaço não comporta. */
export function useTelaEstreita(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  )
}

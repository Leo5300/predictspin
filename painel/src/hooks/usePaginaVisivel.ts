import { useSyncExternalStore } from 'react'

function assinar(ouvinte: () => void) {
  document.addEventListener('visibilitychange', ouvinte)
  return () => document.removeEventListener('visibilitychange', ouvinte)
}

/** Falso quando a aba está em segundo plano: nesse estado o painel não consome eventos nem consulta. */
export function usePaginaVisivel(): boolean {
  return useSyncExternalStore(assinar, () => document.visibilityState === 'visible')
}

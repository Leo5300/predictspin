import { useEffect, useState } from 'react'

type Estado = 'acesa' | 'sem_suporte' | 'negada' | 'inativa'

const temSuporte = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator

/**
 * Mantém a tela acesa durante a gravação (Screen Wake Lock), se o navegador permitir. A trava cai
 * quando a aba vai para segundo plano; ao voltar, é pedida de novo. Devolve se conseguiu.
 */
export function useManterTelaAcesa(ativo: boolean): Estado {
  const [estado, setEstado] = useState<Estado>('inativa')
  const suportado = temSuporte()

  useEffect(() => {
    if (!ativo || !suportado) return
    let sentinela: WakeLockSentinel | null = null
    let cancelado = false
    const pedir = async () => {
      try {
        const nova = await navigator.wakeLock.request('screen')
        if (cancelado) {
          void nova.release()
          return
        }
        sentinela = nova
        setEstado('acesa')
      } catch {
        if (!cancelado) setEstado('negada')
      }
    }
    void pedir()
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && (!sentinela || sentinela.released)) void pedir()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', aoVoltar)
      void sentinela?.release()
    }
  }, [ativo, suportado])

  if (!ativo) return 'inativa'
  if (!suportado) return 'sem_suporte'
  return estado
}

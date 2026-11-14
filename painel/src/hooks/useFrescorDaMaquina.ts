import type { UltimaObservada } from '@/api/consultas'
import type { ModoRapido } from '@/api/tipos'
import { limiarVelhoS, type Frescor } from '@/dominio/idade'
import { modoRapidoAtivo } from '@/dominio/modoRapido'
import { agoraDoServidorMs, useSegundo } from '@/estado/relogio'

import { useFrescor } from './useFrescor'

/**
 * Frescor da última janela de uma máquina, com o limiar certo: 15 s no modo normal, 4 s enquanto a
 * máquina está em modo rápido e a última janela já veio rápida.
 */
export function useFrescorDaMaquina(
  ultima: UltimaObservada | undefined,
  modoRapido?: ModoRapido,
): { frescor: Frescor; idadeS: number | null; velho: boolean } {
  const { epocaMs } = useSegundo()
  const rapidoAtivo =
    modoRapido?.ativo === true &&
    modoRapidoAtivo(modoRapido.modo_rapido_ate, agoraDoServidorMs(epocaMs))
  const limiar = limiarVelhoS(ultima?.janela.modo ?? 'normal', rapidoAtivo)
  const resultado = useFrescor(ultima?.observacao, limiar)
  return { ...resultado, velho: resultado.frescor !== 'vivo' }
}

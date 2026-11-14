import { frescor, idadeEmSegundos, type Frescor, type Observacao } from '@/dominio/idade'
import { useSegundo } from '@/estado/relogio'

/** Frescor de uma observação agora, recalculado a cada segundo. */
export function useFrescor(
  observacao: Observacao | null | undefined,
  limiarS: number,
): { frescor: Frescor; idadeS: number | null } {
  const { monotonicoMs } = useSegundo()
  if (!observacao) return { frescor: 'ausente', idadeS: null }
  return {
    frescor: frescor(observacao, monotonicoMs, limiarS),
    idadeS: idadeEmSegundos(observacao, monotonicoMs),
  }
}

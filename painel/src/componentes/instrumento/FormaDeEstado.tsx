import { cn } from '@/lib/utils'

import { CAMINHO_DA_FORMA, type Forma } from './formasDeEstado'

/** Desenho de uma forma de estado (círculo, triângulo, losango, quadrado ou anel). */
export function FormaDeEstado({ forma, className }: { forma: Forma; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('size-3 shrink-0 fill-current', className)}
    >
      <path d={CAMINHO_DA_FORMA[forma]} fillRule="evenodd" />
    </svg>
  )
}

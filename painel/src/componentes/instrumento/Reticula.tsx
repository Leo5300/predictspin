import { useId } from 'react'

import { cn } from '@/lib/utils'

import { RETICULA_COLUNAS, RETICULA_LINHAS, RETICULA_SUBDIVISOES } from './desenhoDaReticula'

/**
 * Retícula de osciloscópio: grade 10 × 8 em cinza muito claro, com subdivisões. Em SVG, para ficar
 * atrás de um desenho que ocupa a mesma área. Os gráficos em canvas usam desenharReticula (desenhoDaReticula.ts).
 */
export function Reticula({ className }: { className?: string }) {
  const id = useId()
  const fina = `${id}-fina`
  const grossa = `${id}-grossa`
  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    >
      <defs>
        <pattern
          id={fina}
          width={`${100 / (RETICULA_COLUNAS * RETICULA_SUBDIVISOES)}%`}
          height={`${100 / (RETICULA_LINHAS * RETICULA_SUBDIVISOES)}%`}
        >
          <path d="M0 0H9999M0 0V9999" fill="none" stroke="var(--reticula-fina)" strokeWidth="1" />
        </pattern>
        <pattern
          id={grossa}
          width={`${100 / RETICULA_COLUNAS}%`}
          height={`${100 / RETICULA_LINHAS}%`}
        >
          <path d="M0 0H9999M0 0V9999" fill="none" stroke="var(--reticula)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${fina})`} />
      <rect width="100%" height="100%" fill={`url(#${grossa})`} />
    </svg>
  )
}

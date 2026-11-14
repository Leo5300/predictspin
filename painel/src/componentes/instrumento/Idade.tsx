import { TimerOff } from 'lucide-react'

import { formatarIdade } from '@/dominio/formato'
import type { Frescor } from '@/dominio/idade'
import { cn } from '@/lib/utils'

type Props = {
  frescor: Frescor
  idadeS: number | null
  className?: string
}

/**
 * Marca de idade do dado. Vivo: "há 3 s", discreto. Velho: "sem dados há 2 min", com ícone, para o
 * valor velho nunca parecer vivo. Ausente: "sem dados".
 */
export function MarcaDeIdade({ frescor: estado, idadeS, className }: Props) {
  if (estado === 'vivo') {
    return (
      <span className={cn('text-12 whitespace-nowrap text-apoio', className)} data-frescor="vivo">
        há <Idade idadeS={idadeS} />
      </span>
    )
  }
  return (
    <span
      data-frescor={estado}
      className={cn(
        'inline-flex items-center gap-1 border border-dashed border-linha-forte px-1 text-12 font-medium whitespace-nowrap text-texto',
        className,
      )}
    >
      <TimerOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
      {estado === 'velho' ? (
        <span>
          sem dados há <Idade idadeS={idadeS} />
        </span>
      ) : (
        <span>sem dados</span>
      )}
    </span>
  )
}

/** Só o número em fonte de valor; a unidade em texto, separada por espaço fino ("5 s"). */
function Idade({ idadeS }: { idadeS: number | null }) {
  const texto = formatarIdade(idadeS)
  const separador = texto.lastIndexOf(' ')
  if (separador === -1) return <span className="valor">{texto}</span>
  return (
    <>
      <span className="valor">{texto.slice(0, separador)}</span>
      {' '}
      {texto.slice(separador + 1)}
    </>
  )
}

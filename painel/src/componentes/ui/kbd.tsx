import type * as React from 'react'

import { cn } from '@/lib/utils'

/** Chip de tecla (atalho de teclado): R gravar, E marcar evento, Esc cancelar, Ctrl K comandos. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'valor inline-flex h-5 min-w-5 items-center justify-center rounded-2 border border-linha-forte bg-rebaixo px-1 text-12 leading-none font-medium text-apoio',
        // atalho só faz sentido com teclado: some no toque
        'pointer-coarse:hidden max-md:hidden',
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }

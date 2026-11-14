import type * as React from 'react'

import { cn } from '@/lib/utils'

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // O controle é associado por quem usa o componente (htmlFor)
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      data-slot="label"
      className={cn('rotulo flex items-center gap-2 select-none', className)}
      {...props}
    />
  )
}

export { Label }

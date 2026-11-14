import { Input as InputPrimitive } from '@base-ui/react/input'
import type * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'min-h-8 w-full min-w-0 rounded-2 border border-linha-forte bg-rebaixo px-2.5 py-1 text-15 text-texto',
        'pointer-coarse:min-h-11 max-md:min-h-11',
        'placeholder:text-fraco disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-alarme-texto aria-invalid:outline-alarme-texto',
        className,
      )}
      {...props}
    />
  )
}

export { Input }

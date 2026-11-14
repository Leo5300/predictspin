import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import type { VariantProps } from 'class-variance-authority'

import { toggleVariants } from '@/componentes/ui/toggle'
import { cn } from '@/lib/utils'

/** Grupo de teclas coladas (como um seletor de faixa de instrumento): escolha entre poucas opções. */
function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn('flex w-fit flex-row items-stretch', className)}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({ variant, size }),
        'shrink-0 rounded-0 not-first:-ml-px first:rounded-l-2 last:rounded-r-2 focus-visible:z-10 aria-pressed:z-[1]',
        className,
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }

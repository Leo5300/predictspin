import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/** Tecla de alternância: pressionada fica afundada (relevo invertido) e com o fundo de realce. */
const toggleVariants = cva(
  [
    'relevo inline-flex cursor-default items-center justify-center gap-1 rounded-2 border border-linha-forte bg-modulo',
    'text-13 font-medium whitespace-nowrap text-texto select-none',
    'min-h-8 min-w-8 px-2.5 pointer-coarse:min-h-11 max-md:min-h-11',
    // desabilitado sem transparência: o item marcado continua legível (realce e texto), o resto em
    // texto de apoio
    'disabled:pointer-events-none disabled:text-apoio disabled:border-linha',
    'disabled:aria-pressed:bg-realce disabled:aria-pressed:text-texto disabled:aria-pressed:border-linha-forte',
    // marcado = afundado (fundo rebaixado, borda forte, negrito), nunca o preenchimento da ação
    // principal: escolha e ação não podem parecer a mesma coisa
    'aria-pressed:bg-rebaixo aria-pressed:text-texto aria-pressed:border-texto aria-pressed:font-semibold',
    '[@media(hover:hover)_and_(pointer:fine)]:hover:not-aria-pressed:bg-realce',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: { default: '', outline: '' },
      size: { default: '', sm: 'px-2 text-12', lg: '' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }

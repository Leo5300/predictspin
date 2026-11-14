import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Botão com espessura: plano, com 1 px de luz em cima e 1 px de sombra embaixo, que se invertem ao
 * pressionar. A ação principal é preenchida em grafite ("default"); o botão comum é o "outline".
 * Não existe cor de marca.
 */
const buttonVariants = cva(
  [
    'group/button inline-flex shrink-0 cursor-default items-center justify-center gap-1.5 rounded-2 border',
    'text-13 font-medium whitespace-nowrap select-none',
    'min-h-8 px-3 pointer-coarse:min-h-11 max-md:min-h-11',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          'relevo-acao border-acao bg-acao text-acao-texto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-acao-realce',
        outline:
          'relevo border-linha-forte bg-modulo text-texto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce aria-pressed:bg-realce',
        ghost:
          'border-transparent bg-transparent text-texto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce',
        link: 'min-h-0 border-transparent px-0 text-texto underline underline-offset-4 pointer-coarse:min-h-11',
        destructive:
          'relevo border-alarme-texto bg-modulo text-alarme-texto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce',
      },
      size: {
        default: '',
        sm: 'px-2 text-12',
        icon: 'w-8 px-0 pointer-coarse:w-11 max-md:w-11',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

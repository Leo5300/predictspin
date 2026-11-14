import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * O painel troca a escala de texto do Tailwind pela sua (12 / 13 / 15 / 18 / 24 / 32) e usa nomes
 * próprios de cor. Sem dizer isso ao tailwind-merge, ele trataria "text-24" e "text-texto" como a
 * mesma coisa e apagaria uma das duas.
 */
const juntar = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['12', '13', '15', '18', '24', '32', '40', '72'] }],
      rounded: [{ rounded: ['0', '2'] }],
    },
  },
})

/** Junta classes e resolve conflitos de utilidades do Tailwind (a última vence). */
export function cn(...classes: ClassValue[]): string {
  return juntar(clsx(classes))
}

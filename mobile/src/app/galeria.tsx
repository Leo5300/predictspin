/**
 * Galeria de estados: só existe em desenvolvimento. Em produção, __DEV__ é falso, o require some na
 * montagem do bundle e a rota não mostra nada (e é protegida no layout raiz).
 */
import type { ComponentType } from 'react'

const Galeria: ComponentType = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/galeria/Galeria') as { Galeria: ComponentType }).Galeria
  : () => null

export default Galeria

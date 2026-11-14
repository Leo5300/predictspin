import type { ReactNode } from 'react'

/**
 * Unidade dentro de um rótulo em caixa-alta: fica em minúscula ("g", "s"), porque "G" e "S" são
 * outras unidades.
 */
export function Unidade({ children }: { children: ReactNode }) {
  return <span className="tracking-normal normal-case">{children}</span>
}

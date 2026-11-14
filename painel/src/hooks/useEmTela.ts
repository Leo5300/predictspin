import { useEffect, useState, type RefObject } from 'react'

/** Verdadeiro enquanto o elemento está, ao menos em parte, na área visível da página. */
export function useEmTela(ref: RefObject<Element | null>): boolean {
  const [emTela, setEmTela] = useState(true)
  useEffect(() => {
    const elemento = ref.current
    if (!elemento || typeof IntersectionObserver === 'undefined') return
    const observador = new IntersectionObserver((entradas) => {
      const ultima = entradas.at(-1)
      if (ultima) setEmTela(ultima.isIntersecting)
    })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [ref])
  return emTela
}

import { useEffect, useState } from 'react'

/** Abre e fecha a paleta: Ctrl+K (Cmd+K no Mac). Atalho nunca anima. */
export function useAtalhoDaPaleta(): [boolean, (aberta: boolean) => void] {
  const [aberta, setAberta] = useState(false)
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setAberta((a) => !a)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])
  return [aberta, setAberta]
}

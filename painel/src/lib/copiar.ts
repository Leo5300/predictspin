/**
 * Copia um texto. A área de transferência só existe em origem segura (https ou localhost); num
 * celular abrindo o painel pelo IP da rede, falha e devolve falso.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

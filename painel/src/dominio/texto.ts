/** Caracteres como a pessoa os vê (grafemas): "Ç", "é" e emoji contam como um só. */
const SEGMENTADOR = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })

export function grafemas(texto: string): string[] {
  return Array.from(SEGMENTADOR.segment(texto), (parte) => parte.segment)
}

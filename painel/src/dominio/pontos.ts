/**
 * Pontos de medição. No torno: A = acionamento (cabeçote, junto ao mancal dianteiro do
 * eixo-árvore), B = ferramenta–peça (base do carro superior), C = estrutura (ponta direita do
 * barramento). Cada ponto tem um tom neutro e um estilo de linha próprios; nenhum usa cor de estado.
 */

export type PapelPonto = 'acionamento' | 'ferramenta' | 'estrutura'

export const ROTULO_PAPEL: Record<PapelPonto, string> = {
  acionamento: 'acionamento',
  ferramenta: 'ferramenta–peça',
  estrutura: 'estrutura',
}

export function rotuloDoPapel(papel: string | null | undefined): string {
  if (papel === 'acionamento' || papel === 'ferramenta' || papel === 'estrutura')
    return ROTULO_PAPEL[papel]
  return papel ?? ''
}

/** Ordena códigos de ponto de forma estável (A, B, C, depois os demais em ordem alfabética). */
export function ordenarCodigos(codigos: readonly string[]): string[] {
  return [...codigos].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Grandezas de vibração de um ponto numa janela, na ordem em que aparecem na tela. */
export const GRANDEZAS = [
  { chave: 'rms_g', rotulo: 'RMS', unidade: 'g' },
  { chave: 'pico_g', rotulo: 'PICO', unidade: 'g' },
  { chave: 'curtose', rotulo: 'CURT', unidade: '' },
  { chave: 'o1x', rotulo: '1X', unidade: 'g' },
  { chave: 'o2x', rotulo: '2X', unidade: 'g' },
  { chave: 'o3x', rotulo: '3X', unidade: 'g' },
] as const

export type ChaveGrandeza = (typeof GRANDEZAS)[number]['chave']

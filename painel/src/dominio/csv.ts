/**
 * CSV do que está no gráfico, para abrir em planilha no Brasil: separador ponto e vírgula, vírgula
 * decimal e marca de ordem de bytes (o Excel reconhece o UTF-8 por ela). Os instantes vão em
 * ISO-8601 UTC, sem ambiguidade de fuso.
 */

export const SEPARADOR = ';'
const BOM = '﻿'

export type CelulaCsv = string | number | boolean | null | undefined

function celula(valor: CelulaCsv): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? String(valor).replace('.', ',') : ''
  }
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  return /[";\n\r]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor
}

export function gerarCsv(
  colunas: readonly string[],
  linhas: readonly (readonly CelulaCsv[])[],
): string {
  const texto = [
    colunas.map(celula).join(SEPARADOR),
    ...linhas.map((l) => l.map(celula).join(SEPARADOR)),
  ]
  return `${BOM}${texto.join('\r\n')}\r\n`
}

/** Nome de arquivo sem caracteres que o sistema de arquivos recusa. */
export function nomeDeArquivo(partes: readonly string[]): string {
  return `${partes
    .map((p) =>
      p
        .trim()
        .replace(/[^\p{L}\p{N}.-]+/gu, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('_')}.csv`
}

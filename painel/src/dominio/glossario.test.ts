import { describe, expect, it } from 'vitest'

import { CHAVES_DO_GLOSSARIO, GLOSSARIO, nomeDoBotao } from './glossario'

/** O texto de todo arquivo-fonte do painel (o Vite lê na hora do teste). */
const FONTES = import.meta.glob<string>(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('glossário do "?"', () => {
  it('todo exemplo começa por "Exemplo:" e todo termo tem título e explicação', () => {
    for (const chave of CHAVES_DO_GLOSSARIO) {
      const termo = GLOSSARIO[chave]
      expect(termo.exemplo.startsWith('Exemplo:'), chave).toBe(true)
      expect(termo.titulo.length).toBeGreaterThan(0)
      expect(termo.explicacao.length).toBeGreaterThan(20)
    }
    expect(nomeDoBotao('rms')).toBe('O que é RMS?')
  })

  it('todo "?" usado nas telas aponta para uma chave existente', () => {
    const usadas = new Set<string>()
    for (const texto of Object.values(FONTES)) {
      for (const m of texto.matchAll(/<Explica\s+chave="(\w+)"/g)) usadas.add(m[1] ?? '')
      for (const m of texto.matchAll(/\bexplica="(\w+)"/g)) usadas.add(m[1] ?? '')
    }
    expect(usadas.size).toBeGreaterThan(10)
    for (const chave of usadas) expect(CHAVES_DO_GLOSSARIO, chave).toContain(chave)
  })

  it('todas as chaves aparecem na galeria', () => {
    const galeria = FONTES['../galeria/Galeria.tsx'] ?? ''
    expect(galeria).toContain('CHAVES_DO_GLOSSARIO.map((chave) =>')
    expect(galeria).toContain('<Explica chave={chave} />')
  })
})

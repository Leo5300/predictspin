import { describe, expect, it } from 'vitest'

import {
  buscarNoCatalogo,
  distanciaDeEdicao,
  nomeDeExibicao,
  normalizarNome,
  paresParecidos,
  similaridade,
} from './nomes'

const CATALOGO = [
  { id: 1, nome: 'Aço SAE 1045' },
  { id: 2, nome: 'Alumínio 6351' },
  { id: 3, nome: 'Latão' },
  { id: 4, nome: 'Aço inox 304', ativo: false },
]

describe('normalização (igual à da API)', () => {
  it('ignora maiúsculas, acentos, pontuação e espaços extras', () => {
    expect(normalizarNome('  Aço SAE-1045 ')).toBe('aco sae 1045')
    expect(normalizarNome('aco   sae.1045')).toBe('aco sae 1045')
    expect(normalizarNome('Bit de metal duro, ângulo 60°')).toBe('bit de metal duro angulo 60')
    expect(normalizarNome('---')).toBe('')
    expect(normalizarNome(null)).toBe('')
    expect(nomeDeExibicao('  Aço   SAE 1045 ')).toBe('Aço SAE 1045')
  })
})

describe('similaridade', () => {
  it('distância de edição', () => {
    expect(distanciaDeEdicao('alumnio', 'aluminio')).toBe(1)
    expect(distanciaDeEdicao('', 'abc')).toBe(3)
    expect(distanciaDeEdicao('abc', 'abc')).toBe(0)
  })

  it('nome escrito errado ou abreviado fica perto; nome diferente fica longe', () => {
    expect(similaridade('aço 1045', 'Aço SAE 1045')).toBeGreaterThanOrEqual(0.55)
    expect(similaridade('alumnio 6351', 'Alumínio 6351')).toBeGreaterThan(0.8)
    expect(similaridade('latao', 'Latão')).toBe(1)
    expect(similaridade('nylon', 'Aço SAE 1045')).toBeLessThan(0.3)
    expect(similaridade('', 'x')).toBe(0)
  })
})

describe('busca no catálogo', () => {
  it('acha o igual pelo nome normalizado', () => {
    expect(buscarNoCatalogo('ACO sae-1045', CATALOGO).igual?.id).toBe(1)
  })

  it('sem igual, sugere o parecido antes de criar', () => {
    const r = buscarNoCatalogo('aço 1045', CATALOGO)
    expect(r.igual).toBeNull()
    expect(r.parecidos.map((i) => i.id)).toContain(1)
  })

  it('contém o texto e ignora itens desativados', () => {
    const r = buscarNoCatalogo('aço', CATALOGO)
    expect(r.contem.map((i) => i.id)).toEqual([1])
    expect(buscarNoCatalogo('', CATALOGO).contem).toHaveLength(3)
  })

  it('pares que parecem o mesmo', () => {
    const pares = paresParecidos([
      { id: 1, nome: 'Aço SAE 1045' },
      { id: 2, nome: 'aço sae 1045 ' },
      { id: 3, nome: 'Latão' },
    ])
    expect(pares.map(([a, b]) => [a.id, b.id])).toEqual([[1, 2]])
  })
})

import { describe, expect, it } from 'vitest'

import {
  avisosDaReceita,
  lerDecimal,
  RECEITA_VAZIA,
  receitaDoEnsaio,
  receitaParaApi,
  receitaVazia,
  resumoDaReceita,
  validarReceita,
} from './receita'

describe('números da receita', () => {
  it('aceitam vírgula ou ponto; vazio é nulo; texto é NaN', () => {
    expect(lerDecimal('0,15')).toBe(0.15)
    expect(lerDecimal(' 0.15 ')).toBe(0.15)
    expect(lerDecimal(',5')).toBe(0.5)
    expect(lerDecimal('')).toBeNull()
    expect(lerDecimal(undefined)).toBeNull()
    expect(lerDecimal('0,1,5')).toBeNaN()
    expect(lerDecimal('abc')).toBeNaN()
  })
})

describe('validação da receita', () => {
  it('receita vazia é válida e não aparece no resumo', () => {
    expect(validarReceita(RECEITA_VAZIA)).toEqual({})
    expect(receitaVazia(RECEITA_VAZIA)).toBe(true)
    expect(receitaParaApi(RECEITA_VAZIA)).toEqual({})
  })

  it('fora da faixa bloqueia, dizendo a faixa', () => {
    const erros = validarReceita({
      ...RECEITA_VAZIA,
      avanco: '5',
      profundidade: '0,01',
      diametro: 'x',
    })
    expect(erros.avanco).toBe('Entre 0,01 e 2 mm/volta.')
    expect(erros.profundidade).toBe('Entre 0,05 e 10 mm.')
    expect(erros.diametro).toBe('Use só números (vírgula ou ponto).')
  })

  it('dentro da faixa mas incomum só avisa', () => {
    const receita = { ...RECEITA_VAZIA, avanco: '0,9', profundidade: '6', diametro: '38' }
    expect(validarReceita(receita)).toEqual({})
    const avisos = avisosDaReceita(receita)
    expect(avisos.avanco).toContain('incomum')
    expect(avisos.profundidade).toContain('incomum')
    expect(avisos.diametro).toBeUndefined()
  })

  it('vira o corpo da API e o resumo só com o preenchido', () => {
    const receita = {
      ...RECEITA_VAZIA,
      material: { id: 3, nome: 'Aço SAE 1045' },
      avanco: '0,1',
      diametro: '38',
      fluido: 'emulsao' as const,
    }
    expect(receitaParaApi(receita)).toEqual({
      material_id: 3,
      avanco_alvo: 0.1,
      diametro_peca_mm: 38,
      fluido_corte: 'emulsao',
    })
    expect(resumoDaReceita(receita)).toEqual([
      { rotulo: 'Material', valor: 'Aço SAE 1045' },
      { rotulo: 'Avanço', valor: '0,1 mm/volta' },
      { rotulo: 'Diâmetro', valor: '38 mm' },
      { rotulo: 'Fluido', valor: 'Emulsão' },
    ])
  })

  it('repete a receita de um ensaio gravado', () => {
    const r = receitaDoEnsaio({
      material_item: { id: 3, nome: 'Aço' },
      ferramenta_item: null,
      avanco_alvo: 0.15,
      profundidade_corte_mm: 1.5,
      diametro_peca_mm: null,
      fluido_corte: 'seco',
    })
    expect(r).toEqual({
      material: { id: 3, nome: 'Aço' },
      ferramenta: null,
      avanco: '0,15',
      profundidade: '1,5',
      diametro: '',
      fluido: 'seco',
    })
  })
})

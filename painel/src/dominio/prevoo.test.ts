import { describe, expect, it } from 'vitest'

import {
  comprimentoDaFitaS,
  contarMarcas,
  formatarCronometro,
  marcasDaFita,
  posicaoNaFita,
} from './fita'
import { instrucoes, INSTRUCAO_SEMPRE } from './instrucoes'
import { bloqueado, preVoo, type EntradaDoPreVoo } from './prevoo'

const janela = {
  rotacao_rpm: 452,
  saturou: false,
  amostras: 8000,
  amostras_esperadas: 8000,
  simulado: true,
  pontos: { A: {}, B: {}, C: {} },
}

const base: EntradaDoPreVoo = {
  janela,
  frescor: 'vivo',
  etapa: 'T1',
  rotacaoAlvo: 450,
  ensaioAberto: null,
  simulado: true,
  pontosEsperados: ['A', 'B', 'C'],
}

const estados = (e: EntradaDoPreVoo) =>
  Object.fromEntries(preVoo(e).map((i) => [i.chave, i.estado]))

describe('pré-voo', () => {
  it('tudo certo: seis itens ok e não bloqueia', () => {
    const itens = preVoo(base)
    expect(itens.map((i) => i.chave)).toEqual([
      'pontos',
      'rotacao',
      'saturacao',
      'amostras',
      'ensaio',
      'origem',
    ])
    expect(itens.every((i) => i.estado === 'ok')).toBe(true)
    expect(bloqueado(itens)).toBe(false)
  })

  it('sem dado vivo bloqueia; ensaio aberto bloqueia', () => {
    expect(estados({ ...base, frescor: 'velho' }).pontos).toBe('bloqueia')
    expect(bloqueado(preVoo({ ...base, frescor: 'ausente', janela: null }))).toBe(true)
    const aberto = preVoo({ ...base, ensaioAberto: 'TORNO-01-T1-00003' })
    expect(aberto.find((i) => i.chave === 'ensaio')).toMatchObject({
      estado: 'bloqueia',
      detalhe: 'aberto: TORNO-01-T1-00003',
    })
  })

  it('os outros itens só avisam, dizendo o que fazer', () => {
    const itens = preVoo({
      ...base,
      rotacaoAlvo: 900,
      simulado: false,
      janela: { ...janela, saturou: true, amostras: 7000, pontos: { A: {}, B: {} } },
    })
    expect(bloqueado(itens)).toBe(false)
    for (const item of itens.filter((i) => i.chave !== 'ensaio')) {
      expect(item.estado).toBe('aviso')
      expect(item.oQueFazer).toBeTruthy()
    }
  })

  it('rotação: ±10% do alvo; T0 exige o torno parado', () => {
    expect(estados({ ...base, janela: { ...janela, rotacao_rpm: 494 } }).rotacao).toBe('ok')
    expect(estados({ ...base, janela: { ...janela, rotacao_rpm: 500 } }).rotacao).toBe('aviso')
    expect(estados({ ...base, etapa: 'T0', janela: { ...janela, rotacao_rpm: 0 } }).rotacao).toBe(
      'ok',
    )
    expect(estados({ ...base, etapa: 'T0' }).rotacao).toBe('aviso')
    expect(estados({ ...base, janela: { ...janela, amostras: null } }).amostras).toBe('aviso')
  })
})

describe('fita da gravação', () => {
  const inicio = Date.parse('2026-11-14T12:00:00Z')
  const j = (id: number, s: number, extra = {}) => ({
    id,
    medido_em: new Date(inicio + s * 1000).toISOString(),
    saturou: false,
    amostras: 8000,
    amostras_esperadas: 8000,
    ...extra,
  })

  it('um traço por janela, sem repetir, com marca para saturada e incompleta', () => {
    const marcas = marcasDaFita(
      [j(1, 0), j(2, 5, { saturou: true }), j(3, 10, { amostras: 7000 }), j(1, 0)],
      inicio,
      120,
    )
    expect(marcas.map((m) => m.tipo)).toEqual(['janela', 'saturada', 'incompleta'])
    expect(marcas[1]?.posicao).toBeCloseTo(5 / 120)
    expect(contarMarcas(marcas)).toEqual({ janelas: 3, saturadas: 1, incompletas: 1 })
  })

  it('fita de 2 min que cresce com a gravação (não para sozinha)', () => {
    expect(comprimentoDaFitaS(30)).toBe(120)
    expect(comprimentoDaFitaS(600)).toBeGreaterThan(600)
    expect(posicaoNaFita(inicio + 60_000, inicio, 120)).toBe(0.5)
    expect(posicaoNaFita(inicio - 1000, inicio, 120)).toBe(0)
  })

  it('cronômetro', () => {
    expect(formatarCronometro(7)).toBe('0:07')
    expect(formatarCronometro(65)).toBe('1:05')
    expect(formatarCronometro(3723)).toBe('1:02:03')
    expect(formatarCronometro(-3)).toBe('0:00')
  })
})

describe('cartão o que fazer agora', () => {
  it('etapa e corte, sempre com a frase de segurança', () => {
    expect(instrucoes('T0', 'normal').principal).toBe(
      'Torno desligado. A oficina pode estar funcionando normalmente.',
    )
    expect(instrucoes('T3', 'sensor_solto').principal).toContain('ímã de um sensor')
    expect(instrucoes('T2', 'normal').sempre).toBe(INSTRUCAO_SEMPRE)
  })
})

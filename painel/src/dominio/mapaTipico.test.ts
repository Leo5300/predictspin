import { describe, expect, it } from 'vitest'

import {
  classificarLinha,
  desvioRelativo,
  destaquesDoMapa,
  FAIXA_MORTA,
  intensidadeDoDesvio,
  marchaDoIntervalo,
  mediana,
  textoDoDestaque,
  TEXTO_NORMAL,
  trocasDeMarcha,
  type Destaque,
} from './mapaTipico'

function exigir(d: Destaque | null): Destaque {
  if (!d) throw new Error('sem destaque')
  return d
}

const NOMINAIS = [450, 560, 710, 900, 1120, 1400]

describe('marcha do intervalo', () => {
  it('é a nominal mais próxima; parada é 0; sem rotação é nulo', () => {
    expect(marchaDoIntervalo(1178, NOMINAIS)).toBe(1120)
    expect(marchaDoIntervalo(452, NOMINAIS)).toBe(450)
    expect(marchaDoIntervalo(3, NOMINAIS)).toBe(0)
    expect(marchaDoIntervalo(null, NOMINAIS)).toBeNull()
    expect(marchaDoIntervalo(800, [])).toBe(800)
  })
})

describe('típico e faixa morta', () => {
  it('mediana de lista par, ímpar e vazia', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 3, 2])).toBe(2.5)
    expect(mediana([])).toBeNull()
  })

  it('dentro de ±15 % do típico é a mesma classe e intensidade zero', () => {
    const marchas = Array<number>(8).fill(1120)
    const classes = classificarLinha(
      [0.04, 0.042, 0.045, 0.05, 0.044, 0.046, 0.043, 0.047],
      marchas,
    )
    expect(classes.every((c) => c.tipo === 'tipico')).toBe(true)
    expect(intensidadeDoDesvio(0.1)).toBe(0)
    expect(intensidadeDoDesvio(-FAIXA_MORTA + 0.001)).toBe(0)
  })

  it('acima do típico cresce de forma contínua e satura em +100 %', () => {
    expect(intensidadeDoDesvio(0.2)).toBeGreaterThan(0)
    expect(intensidadeDoDesvio(0.5)).toBeGreaterThan(intensidadeDoDesvio(0.3))
    expect(intensidadeDoDesvio(1)).toBe(1)
    expect(intensidadeDoDesvio(3)).toBe(1)
    const classes = classificarLinha([1, 1, 1, 1, 1, 1.5, 0.5], Array<number>(7).fill(900))
    expect(classes[5]).toMatchObject({ tipo: 'acima', desvio: 0.5 })
    expect(classes[6]).toMatchObject({ tipo: 'abaixo', desvio: -0.5 })
  })

  it('compara só com a mesma marcha: trocar de marcha não destaca nada', () => {
    const valores = [0.04, 0.041, 0.04, 0.042, 0.04, 0.09, 0.091, 0.09, 0.092, 0.09]
    const marchas = [450, 450, 450, 450, 450, 1120, 1120, 1120, 1120, 1120]
    const classes = classificarLinha(valores, marchas)
    expect(classes.every((c) => c.tipo === 'tipico')).toBe(true)
  })

  it('lacuna continua lacuna; marcha com poucas células fica sem típico', () => {
    const classes = classificarLinha(
      [0.04, null, 0.04, 0.04, 0.04, 0.2],
      [900, null, 900, 900, 900, 1400],
    )
    expect(classes[1]).toEqual({ tipo: 'lacuna' })
    expect(classes[5]).toMatchObject({ tipo: 'sem_tipico', marcha: 1400, incompleto: false })
    expect(classes[0]).toMatchObject({ tipo: 'tipico' })
  })

  it('intervalo incompleto (borda de lacuna) fica neutro e fora do típico', () => {
    const valores = [0.05, 0.05, 0.05, 0.05, 0.05, 0.03, null]
    const janelas = [3, 3, 3, 3, 3, 1, 0]
    const classes = classificarLinha(valores, Array<number>(7).fill(900), janelas)
    expect(classes[5]).toMatchObject({ tipo: 'sem_tipico', incompleto: true })
    expect(classes[4]).toMatchObject({ tipo: 'tipico', tipico: 0.05 })
  })

  it('típico zero: só zero é igual', () => {
    expect(desvioRelativo(0, 0)).toBe(0)
    expect(desvioRelativo(0.01, 0)).toBe(1)
  })
})

describe('leitura em texto', () => {
  const marchas = Array<number>(12).fill(1120)

  it('máquina saudável: nenhuma linha em destaque', () => {
    const classes = classificarLinha(Array<number>(12).fill(0.08), marchas)
    expect(destaquesDoMapa([{ ponto: 'B', grandeza: 'RMS', classes }])).toEqual([])
    expect(TEXTO_NORMAL).toBe('Normal: todas as linhas dentro de ±15% do típico')
  })

  it('aponta a linha que fugiu, desde quando e em que marcha, maiores primeiro', () => {
    const b = classificarLinha([...Array<number>(8).fill(0.08), 0.1, 0.1, 0.1, 0.1], marchas)
    const a = classificarLinha([...Array<number>(9).fill(0.04), 0.032, 0.032, 0.032], marchas)
    const destaques = destaquesDoMapa([
      { ponto: 'A', grandeza: '1X', classes: a },
      { ponto: 'B', grandeza: 'RMS', classes: b },
    ])
    expect(destaques.map((d) => `${d.ponto}·${d.grandeza}`)).toEqual(['B·RMS', 'A·1X'])
    expect(destaques.every((d) => d.outras === 0)).toBe(true)
    const primeiro = destaques[0]
    if (!primeiro) throw new Error('sem destaque')
    expect(primeiro).toMatchObject({ direcao: 'acima', inicio: 8, fim: 11, emCurso: true })
    expect(textoDoDestaque(primeiro, '17:02', '17:05')).toBe(
      'B·RMS 25% acima do típico desde 17:02 (marcha 1120)',
    )
  })

  it('trecho que terminou diz entre quando; ponto solto não vira destaque', () => {
    const valores = [
      ...Array<number>(4).fill(0.05),
      0.08,
      0.08,
      0.08,
      ...Array<number>(4).fill(0.05),
      0.09,
    ]
    const [d = null] = destaquesDoMapa([
      { ponto: 'C', grandeza: '2X', classes: classificarLinha(valores, marchas) },
    ])
    expect(d).toMatchObject({ inicio: 4, fim: 6, emCurso: false })
    expect(textoDoDestaque(exigir(d), '10:00', '10:01')).toBe(
      'C·2X 60% acima do típico entre 10:00 e 10:01 (marcha 1120)',
    )
  })

  it('uma frase por ponto: a medida mais forte e quantas outras linhas do ponto fugiram', () => {
    const marchas900 = Array<number>(10).fill(900)
    const fugindo = (fator: number) =>
      classificarLinha([...Array<number>(8).fill(1), fator, fator], marchas900)
    const destaques = destaquesDoMapa([
      { ponto: 'B', grandeza: 'RMS', classes: fugindo(1.5) },
      { ponto: 'B', grandeza: '1X', classes: fugindo(1.9) },
      { ponto: 'B', grandeza: '2X', classes: fugindo(1.3) },
      { ponto: 'C', grandeza: 'RMS', classes: fugindo(1.2) },
    ])
    expect(destaques.map((d) => [d.ponto, d.grandeza, d.outras])).toEqual([
      ['B', '1X', 2],
      ['C', 'RMS', 0],
    ])
    expect(textoDoDestaque(exigir(destaques[0] ?? null), '17:02', '17:03')).toBe(
      'B·1X 90% acima do típico desde 17:02 (marcha 900); mais 2 linhas do B',
    )
  })

  it('no máximo três pontos', () => {
    const linhas = ['A', 'B', 'C', 'D'].map((ponto, i) => ({
      ponto,
      grandeza: 'RMS',
      classes: classificarLinha(
        [...Array<number>(8).fill(1), 2 + i, 2 + i],
        Array<number>(10).fill(900),
      ),
    }))
    expect(destaquesDoMapa(linhas)).toHaveLength(3)
  })

  it('trocas de marcha', () => {
    expect(trocasDeMarcha([450, 450, null, 450, 1120, 1120, 0])).toEqual([
      { indice: 0, marcha: 450 },
      { indice: 4, marcha: 1120 },
      { indice: 6, marcha: 0 },
    ])
  })
})

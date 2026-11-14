import { describe, expect, it } from 'vitest'

import {
  condicoesDaEtapa,
  gradeDeCobertura,
  percentualDaCobertura,
  proximaSugerida,
  repeticaoSugerida,
  rotacaoDaEtapa,
  rotacoesDaConsulta,
  rotacoesDoPlano,
  type ItemDeCobertura,
} from './coleta'

const item = (
  etapa: ItemDeCobertura['etapa'],
  condicao: ItemDeCobertura['condicao'],
  rotacao: number,
  validos: number,
): ItemDeCobertura => ({ etapa, condicao, rotacao_alvo_rpm: rotacao, ensaios_validos: validos })

describe('grade de cobertura', () => {
  it('T0 só a 0 rpm; T1 e T2 só normal; T3 com as seis condições', () => {
    const grade = gradeDeCobertura([], [900, 450], 3)
    expect(grade).toHaveLength(1 + 2 + 2 + 6 * 2)
    expect(grade[0]).toMatchObject({ etapa: 'T0', condicao: 'normal', rotacao: 0 })
    expect(grade.filter((c) => c.etapa === 'T1').map((c) => c.rotacao)).toEqual([450, 900])
    expect(grade.filter((c) => c.etapa !== 'T3').every((c) => c.condicao === 'normal')).toBe(true)
    expect(grade.at(-1)).toMatchObject({ etapa: 'T3', condicao: 'sensor_solto', uso: 'validacao' })
  })

  it('usa as contagens da API e calcula quanto falta', () => {
    const grade = gradeDeCobertura(
      [item('T1', 'normal', 450, 2), item('T0', 'normal', 0, 5)],
      [450],
      3,
    )
    expect(grade.find((c) => c.etapa === 'T1')).toMatchObject({ validos: 2, faltam: 1 })
    expect(grade[0]).toMatchObject({ validos: 5, faltam: 0 })
  })

  it('plano com repetição, zero e fora de ordem vira crescente', () => {
    expect(rotacoesDoPlano([900, 450, 900, 0])).toEqual([450, 900])
    expect(rotacoesDaConsulta([900, 450])).toEqual([0, 450, 900])
  })
})

describe('próxima gravação sugerida', () => {
  it('começa pelo T0 e segue T1 → T2 → T3 nas rotações crescentes', () => {
    expect(proximaSugerida(gradeDeCobertura([], [450, 900], 3))).toMatchObject({ etapa: 'T0' })
    const comT0 = gradeDeCobertura([item('T0', 'normal', 0, 1)], [450, 900], 3)
    expect(proximaSugerida(comT0)).toMatchObject({ etapa: 'T1', rotacao: 450 })
  })

  it('a célula com menos válidos em relação à meta vence a ordem', () => {
    const grade = gradeDeCobertura(
      [
        item('T0', 'normal', 0, 3),
        item('T1', 'normal', 450, 2),
        item('T1', 'normal', 900, 2),
        item('T2', 'normal', 450, 1),
      ],
      [450, 900],
      3,
    )
    expect(proximaSugerida(grade)).toMatchObject({ etapa: 'T2', rotacao: 900, validos: 0 })
  })

  it('no T3, normal antes das outras e sensor_solto por último', () => {
    const feitos = [
      item('T0', 'normal', 0, 1),
      item('T1', 'normal', 450, 1),
      item('T2', 'normal', 450, 1),
    ]
    expect(proximaSugerida(gradeDeCobertura(feitos, [450], 1))).toMatchObject({
      etapa: 'T3',
      condicao: 'normal',
    })
    const quaseTudo = [
      ...feitos,
      ...[
        'normal',
        'ferramenta_desgastada',
        'avanco_excessivo',
        'rotacao_inadequada',
        'desbalanceamento',
      ].map((c) => item('T3', c as ItemDeCobertura['condicao'], 450, 1)),
    ]
    expect(proximaSugerida(gradeDeCobertura(quaseTudo, [450], 1))).toMatchObject({
      condicao: 'sensor_solto',
    })
  })

  it('grade completa: nenhuma sugestão; percentual da cobertura', () => {
    const grade = gradeDeCobertura([item('T0', 'normal', 0, 4)], [], 3)
    expect(proximaSugerida(grade)).toBeNull()
    expect(percentualDaCobertura(grade)).toBe(1)
    expect(percentualDaCobertura([])).toBe(0)
    expect(
      percentualDaCobertura(gradeDeCobertura([item('T0', 'normal', 0, 1)], [450], 1)),
    ).toBeCloseTo(1 / 9)
  })

  it('condições e rotação de cada etapa; repetição sugerida', () => {
    expect(condicoesDaEtapa('T1')).toEqual(['normal'])
    expect(condicoesDaEtapa('T3')).toHaveLength(6)
    expect(rotacaoDaEtapa('T0', 450)).toBe(0)
    expect(rotacaoDaEtapa('T2', 450)).toBe(450)
    expect(repeticaoSugerida({ validos: 2 })).toBe(3)
    expect(repeticaoSugerida(null)).toBe(1)
  })
})

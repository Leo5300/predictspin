import { describe, expect, it } from 'vitest'

import {
  TRACO,
  formatarCurtose,
  formatarG,
  formatarIdade,
  formatarIntervalo,
  formatarNumero,
  formatarPercentual,
  formatarPrazo,
  formatarRpm,
  fracao,
} from './formato'

// O Intl usa espaço inseparável antes de "mil"/"mi"; normaliza para comparar
const ESPACOS_INSEPARAVEIS = new RegExp(
  `[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`,
  'g',
)
const limpo = (texto: string) => texto.replace(ESPACOS_INSEPARAVEIS, ' ')

describe('formatação pt-BR', () => {
  it('usa vírgula decimal e casas fixas', () => {
    expect(formatarG(0.0451)).toBe('0,045')
    expect(formatarG(1)).toBe('1,000')
    expect(formatarCurtose(3.14159)).toBe('3,14')
    expect(formatarNumero(-0.5, 1)).toBe('-0,5')
  })

  it('rotação inteira e sem separador de milhar', () => {
    expect(formatarRpm(1180.4)).toBe('1180')
    expect(formatarRpm(0)).toBe('0')
    expect(formatarRpm(2240)).toBe('2240')
    expect(formatarRpm(null)).toBe(TRACO)
  })

  it('valor ausente ou inválido vira travessão, nunca NaN', () => {
    expect(formatarG(null)).toBe(TRACO)
    expect(formatarG(undefined)).toBe(TRACO)
    expect(formatarNumero(Number.NaN, 2)).toBe(TRACO)
    expect(formatarNumero(Number.POSITIVE_INFINITY, 2)).toBe(TRACO)
    expect(formatarPercentual(null)).toBe(TRACO)
  })

  it('número enorme sai compacto para caber na leitura', () => {
    expect(limpo(formatarNumero(123_456, 3))).toBe('123,5 mil')
    expect(limpo(formatarNumero(98_765_432, 0))).toBe('98,8 mi')
    expect(formatarNumero(99_999, 0)).toBe('99.999')
  })

  it('percentual e fração', () => {
    expect(formatarPercentual(fracao(7960, 8000), 1)).toBe('99,5 %')
    expect(formatarPercentual(1)).toBe('100 %')
    expect(fracao(10, 0)).toBeNull()
    expect(fracao(null, 8000)).toBeNull()
    expect(fracao(10, null)).toBeNull()
  })

  it('idade em palavras curtas', () => {
    expect(formatarIdade(0.4)).toBe('0 s')
    expect(formatarIdade(59.9)).toBe('59 s')
    expect(formatarIdade(60)).toBe('1 min')
    expect(formatarIdade(3599)).toBe('59 min')
    expect(formatarIdade(3600)).toBe('1 h')
    expect(formatarIdade(86_400 * 2 + 5)).toBe('2 d')
    expect(formatarIdade(-3)).toBe('0 s')
    expect(formatarIdade(null)).toBe(TRACO)
  })

  it('prazo em m:ss arredondando para cima', () => {
    expect(formatarPrazo(120)).toBe('2:00')
    expect(formatarPrazo(117.2)).toBe('1:58')
    expect(formatarPrazo(9)).toBe('0:09')
    expect(formatarPrazo(-1)).toBe('0:00')
  })

  it('duração do intervalo de agregação', () => {
    expect(formatarIntervalo(15)).toBe('15 s')
    expect(formatarIntervalo(60)).toBe('1 min')
    expect(formatarIntervalo(150)).toBe('2,5 min')
    expect(formatarIntervalo(7200)).toBe('2 h')
    expect(formatarIntervalo(0)).toBe(TRACO)
  })
})

import { describe, expect, it } from 'vitest'

import { descricaoDoModelo, ultimoContato } from './maquina'
import {
  fracaoLog,
  limitesDaEscala,
  marcasDoTacometro,
  marchaMaisProxima,
  rpmSemMilhar,
} from './tacometro'

const NOMINAIS_TORNO = [
  45, 71, 90, 112, 140, 180, 224, 265, 280, 355, 450, 560, 710, 900, 1120, 1400, 1800, 2240,
]

describe('tacômetro', () => {
  it('escala logarítmica entre os limites, presa nas pontas', () => {
    expect(fracaoLog(100, 10, 1000)).toBeCloseTo(0.5)
    expect(fracaoLog(10, 10, 1000)).toBe(0)
    expect(fracaoLog(1000, 10, 1000)).toBe(1)
    expect(fracaoLog(5, 10, 1000)).toBe(0)
    expect(fracaoLog(9999, 10, 1000)).toBe(1)
    expect(fracaoLog(0, 10, 1000)).toBe(0)
    expect(fracaoLog(Number.NaN, 10, 1000)).toBe(0)
  })

  it('limites um pouco além das rotações nominais', () => {
    const [minimo, maximo] = limitesDaEscala(NOMINAIS_TORNO)
    expect(minimo).toBeCloseTo(45 * 0.85)
    expect(maximo).toBeCloseTo(2240 * 1.15)
    expect(limitesDaEscala([])).toEqual([10, 3000])
  })

  it('marcha mais próxima pela distância relativa', () => {
    expect(marchaMaisProxima(1180, NOMINAIS_TORNO)).toBe(1120)
    expect(marchaMaisProxima(1270, NOMINAIS_TORNO)).toBe(1400)
    expect(marchaMaisProxima(272, NOMINAIS_TORNO)).toBe(265)
    expect(marchaMaisProxima(30, NOMINAIS_TORNO)).toBe(45)
    expect(marchaMaisProxima(0, NOMINAIS_TORNO)).toBeNull()
    expect(marchaMaisProxima(null, NOMINAIS_TORNO)).toBeNull()
    expect(marchaMaisProxima(1180, [])).toBeNull()
  })

  it('rótulos que se encostariam vão para a segunda fileira, por fora', () => {
    const [minimo, maximo] = limitesDaEscala(NOMINAIS_TORNO)
    const marcas = marcasDoTacometro(NOMINAIS_TORNO, minimo, maximo, 240, 9)
    expect(marcas).toHaveLength(18)
    expect(marcas.find((m) => m.nominal === 265)?.segundaFileira).toBe(false)
    expect(marcas.find((m) => m.nominal === 280)?.segundaFileira).toBe(true)
    expect(marcas[0]?.segundaFileira).toBe(false)
    expect(marcas.every((m, i, todas) => i === 0 || m.fracao > (todas[i - 1]?.fracao ?? 0))).toBe(
      true,
    )
  })

  it('rotação sem separador de milhar para a matriz de pontos', () => {
    expect(rpmSemMilhar(1180.4)).toBe('1180')
    expect(rpmSemMilhar(2240)).toBe('2240')
    expect(rpmSemMilhar(0)).toBe('0')
    expect(rpmSemMilhar(null)).toBe('—')
  })
})

describe('textos da máquina', () => {
  it('não repete o fabricante que já está no modelo', () => {
    expect(descricaoDoModelo('ROMI Tormax 30', 'ROMI')).toBe('ROMI Tormax 30')
    expect(descricaoDoModelo('Tormax 30', 'ROMI')).toBe('Tormax 30 · ROMI')
    expect(descricaoDoModelo('Tormax 30', null)).toBe('Tormax 30')
    expect(descricaoDoModelo('Tormax 30', '  ')).toBe('Tormax 30')
  })

  it('último contato reflete a janela recebida quando ela é mais nova', () => {
    const janela = { dispositivo: 'ps-sim-01', recebido_em: '2026-11-13T04:09:38Z' }
    expect(ultimoContato('2026-11-13T04:09:23Z', janela, 'ps-sim-01')).toBe('2026-11-13T04:09:38Z')
    expect(ultimoContato('2026-11-13T04:09:50Z', janela, 'ps-sim-01')).toBe('2026-11-13T04:09:50Z')
    // janela de outro dispositivo não conta
    expect(ultimoContato('2026-11-13T04:09:23Z', janela, 'ps-torno-01')).toBe(
      '2026-11-13T04:09:23Z',
    )
    expect(ultimoContato(null, janela, 'ps-sim-01')).toBe('2026-11-13T04:09:38Z')
    expect(ultimoContato(null, null, 'ps-sim-01')).toBeNull()
  })
})

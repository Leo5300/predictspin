import { describe, expect, it } from 'vitest'

import { consultaEstadoDemo, INTERVALO_DEMO_MS } from './demonstracao'

/** Intervalo de nova consulta que a configuração devolve para um dado em cache. */
function intervaloPara(data: unknown): unknown {
  const regra = consultaEstadoDemo().refetchInterval
  if (typeof regra !== 'function') throw new Error('a consulta deve ter um intervalo calculado')
  return regra({ state: { data } } as unknown as Parameters<typeof regra>[0])
}

describe('consultaEstadoDemo', () => {
  it('desligada ou sem permissão (nulo): não pergunta de novo', () => {
    expect(intervaloPara(null)).toBe(false)
  })

  it('com estado, continua perguntando para acompanhar a volta e a parada automáticas', () => {
    expect(intervaloPara({ nivel: 'ALARME' })).toBe(INTERVALO_DEMO_MS)
  })

  it('depois de um erro passageiro (sem dado), tenta de novo: a barra aparece quando a API acordar', () => {
    expect(intervaloPara(undefined)).toBe(INTERVALO_DEMO_MS)
  })
})

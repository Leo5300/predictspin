import { describe, expect, it } from 'vitest'

import { rotuloDoCanal } from './canais'

describe('rótulo do canal pelo local', () => {
  it('distingue as três temperaturas e a umidade pelo código', () => {
    expect(rotuloDoCanal('amb_temp_c', 'temperatura')).toBe('Temperatura ambiente')
    expect(rotuloDoCanal('temp_cabecote_c', 'temperatura')).toBe('Temperatura do cabeçote')
    expect(rotuloDoCanal('temp_ferramenta_c', 'temperatura')).toBe('Temperatura da ferramenta')
    expect(rotuloDoCanal('amb_umid_pct', 'umidade')).toBe('Umidade ambiente')
    expect(rotuloDoCanal('corrente_a', 'corrente')).toBe('Corrente')
  })

  it('código desconhecido fica só com a grandeza', () => {
    expect(rotuloDoCanal('x9', 'tensao')).toBe('Tensão')
    expect(rotuloDoCanal('x9', 'vazao')).toBe('Vazao')
  })
})

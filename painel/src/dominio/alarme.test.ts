import { describe, expect, it } from 'vitest'

import { afetadaPelaRecuperacao } from '@/api/consultas'

import {
  avaliacaoDoPonto,
  classeDoDesvio,
  desvioDoZ,
  reguaEmZ,
  resumoDosPontos,
  situacaoDoPonto,
} from './estado'
import { GLOSSARIO, interpolar, usaValores } from './glossario'

const LIMITES = { z_atencao: 3, z_alarme: 5 }

describe('estado do ponto pela avaliação da API', () => {
  it('só há estado quando a API avaliou o ponto', () => {
    expect(avaliacaoDoPonto({ situacao: 'avaliada', estado: 'alarme' })).toBe('alarme')
    expect(avaliacaoDoPonto({ situacao: 'avaliada', estado: 'normal' })).toBe('normal')
    expect(avaliacaoDoPonto({ situacao: 'calibracao_diferente', estado: null })).toBe(
      'sem_referencia',
    )
    expect(avaliacaoDoPonto({ situacao: 'avaliada', estado: 'outro' })).toBe('sem_referencia')
    expect(avaliacaoDoPonto(undefined)).toBe('sem_referencia')
  })

  it('situação conhecida ou "sem referência"', () => {
    expect(situacaoDoPonto({ situacao: 'sem_referencia_completa' })).toBe('sem_referencia_completa')
    expect(situacaoDoPonto({ situacao: 'nao_avaliavel' })).toBe('nao_avaliavel')
    expect(situacaoDoPonto({ situacao: 'qualquer' })).toBe('sem_referencia')
    expect(situacaoDoPonto(null)).toBe('sem_referencia')
  })

  it('a máquina fica com o pior ponto avaliado, ou com o motivo comum', () => {
    expect(
      resumoDosPontos([
        { situacao: 'avaliada', estado: 'normal' },
        { situacao: 'avaliada', estado: 'atencao' },
        { situacao: 'calibracao_diferente', estado: null },
      ]),
    ).toEqual({ situacao: 'avaliada', estado: 'atencao' })
    expect(resumoDosPontos([undefined, { situacao: 'sem_referencia', estado: null }])).toEqual({
      situacao: 'sem_referencia',
      estado: null,
    })
    expect(resumoDosPontos([undefined])).toBeNull()
  })

  it('valor em desvio só acima dos limites da API', () => {
    expect(desvioDoZ(2.9, LIMITES)).toBeNull()
    expect(desvioDoZ(3, LIMITES)).toBe('atencao')
    expect(desvioDoZ(5.1, LIMITES)).toBe('alarme')
    expect(desvioDoZ(-8, LIMITES)).toBeNull()
    expect(desvioDoZ(9, undefined)).toBeNull()
    expect(desvioDoZ(undefined, LIMITES)).toBeNull()
    expect(classeDoDesvio('alarme')).toBe('text-alarme-texto')
    expect(classeDoDesvio('atencao')).toBe('text-atencao-texto')
    expect(classeDoDesvio(null)).toBe('')
  })

  it('régua em z: centro no típico, marcas nos limites', () => {
    expect(reguaEmZ(LIMITES)).toEqual({ centro: 0, tolerancia: 3, atencao: 3, alarme: 5 })
  })
})

describe('glossário com os limites em uso', () => {
  it('troca {nome} pelo valor da API e mostra "…" enquanto carrega', () => {
    const valores = { z_atencao: 3, z_alarme: 5, atraso_s: 15, saida_s: 15 }
    expect(interpolar(GLOSSARIO.atencao_alarme.exemplo, valores)).toBe(
      'Exemplo: o B ficou 15 s acima de 5 e o alarme acendeu.',
    )
    expect(interpolar('a partir de {z_alarme}', undefined)).toBe('a partir de …')
    expect(interpolar('z {z_atencao}', { ...valores, z_atencao: 2.5 })).toBe('z 2,5')
  })

  it('nenhum limite escrito à mão nos termos da regra de alarme', () => {
    expect(usaValores('desvio')).toBe(true)
    expect(usaValores('atencao_alarme')).toBe(true)
    expect(usaValores('rms')).toBe(false)
    const texto = GLOSSARIO.desvio.explicacao + GLOSSARIO.atencao_alarme.explicacao
    expect(texto).not.toMatch(/\b(3|5|15) ?s?\b/)
  })
})

describe('evento "recuperacao"', () => {
  const de = '2026-11-18T10:00:00Z'
  const ate = '2026-11-18T10:30:00Z'
  it('refaz as consultas do agora e as de período que cruzam a recuperação', () => {
    expect(afetadaPelaRecuperacao(['ultima-janela', 1, true], 1, true, de, ate)).toBe(true)
    expect(afetadaPelaRecuperacao(['serie', 1, true, 900, 60], 1, true, de, ate)).toBe(true)
    expect(
      afetadaPelaRecuperacao(
        ['janelas-periodo', 1, true, '2026-11-18T10:20:00Z', '2026-11-18T11:00:00Z'],
        1,
        true,
        de,
        ate,
      ),
    ).toBe(true)
    expect(
      afetadaPelaRecuperacao(
        ['serie-periodo', 1, true, '2026-11-18T11:00:00Z', '2026-11-18T12:00:00Z', 60],
        1,
        true,
        de,
        ate,
      ),
    ).toBe(false)
  })

  it('nunca mexe em outra máquina, outra fonte ou outra consulta', () => {
    expect(afetadaPelaRecuperacao(['ultima-janela', 2, true], 1, true, de, ate)).toBe(false)
    expect(afetadaPelaRecuperacao(['ultima-janela', 1, false], 1, true, de, ate)).toBe(false)
    expect(afetadaPelaRecuperacao(['maquinas'], 1, true, de, ate)).toBe(false)
    expect(afetadaPelaRecuperacao(['ensaios', 1, true], 1, true, de, ate)).toBe(false)
  })
})

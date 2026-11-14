import { describe, expect, it } from 'vitest'

import { RECEITA_VAZIA } from './receita'
import {
  avancar,
  concluida,
  criarSessao,
  etapaAtual,
  gravarSessao,
  lerSessao,
  proximaDaSessao,
  pular,
  textoDaProxima,
} from './sessao'

const base = {
  maquinaId: 1,
  rotacao: 450,
  condicaoT3: 'avanco_excessivo' as const,
  receita: { ...RECEITA_VAZIA, avanco: '0,15' },
  simulado: true,
  agora: new Date('2026-11-14T12:00:00Z'),
}

function memoria() {
  const dados = new Map<string, string>()
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    dados,
  }
}

describe('sessão encadeada', () => {
  it('T0 opcional no começo; T0 grava a 0 rpm e só T3 leva a condição', () => {
    const comT0 = criarSessao({ ...base, comT0: true })
    expect(comT0.etapas).toEqual(['T0', 'T1', 'T2', 'T3'])
    expect(proximaDaSessao(comT0)).toEqual({ etapa: 'T0', condicao: 'normal', rotacao: 0 })
    const semT0 = criarSessao({ ...base, comT0: false })
    expect(semT0.etapas).toEqual(['T1', 'T2', 'T3'])
    expect(textoDaProxima(semT0)).toBe('T1 a 450 rpm')
  })

  it('avança ao encerrar cada etapa, com a mesma receita, até concluir', () => {
    let s = criarSessao({ ...base, comT0: false })
    s = avancar(s, { etapa: 'T1', ensaioId: 10, codigo: 'TORNO-01-T1-00010' })
    expect(etapaAtual(s)).toBe('T2')
    expect(textoDaProxima(s)).toBe('T2 a 450 rpm')
    s = avancar(s, { etapa: 'T2', ensaioId: 11, codigo: 'TORNO-01-T2-00011' })
    expect(proximaDaSessao(s)).toEqual({ etapa: 'T3', condicao: 'avanco_excessivo', rotacao: 450 })
    expect(s.receita.avanco).toBe('0,15')
    s = avancar(s, { etapa: 'T3', ensaioId: 12, codigo: 'TORNO-01-T3-00012' })
    expect(concluida(s)).toBe(true)
    expect(proximaDaSessao(s)).toBeNull()
    expect(textoDaProxima(s)).toBe('sessão concluída')
    expect(avancar(s, { etapa: 'T3', ensaioId: 13, codigo: 'x' })).toBe(s)
  })

  it('pula uma etapa', () => {
    let s = criarSessao({ ...base, comT0: true })
    s = pular(s)
    expect(s.puladas).toEqual(['T0'])
    expect(etapaAtual(s)).toBe('T1')
    s = pular(pular(pular(s)))
    expect(concluida(s)).toBe(true)
    expect(pular(s)).toBe(s)
  })

  it('pode começar numa etapa do meio', () => {
    expect(criarSessao({ ...base, comT0: true, desde: 'T2' }).etapas).toEqual(['T2', 'T3'])
  })

  it('retoma depois de recarregar e descarta o que não é sessão', () => {
    const m = memoria()
    const s = avancar(criarSessao({ ...base, comT0: false }), {
      etapa: 'T1',
      ensaioId: 10,
      codigo: 'c',
    })
    gravarSessao(m, s)
    expect(lerSessao(m)).toEqual(s)
    m.setItem('ps.sessao-coleta', '{"qualquer":1}')
    expect(lerSessao(m)).toBeNull()
    m.setItem('ps.sessao-coleta', 'não é json')
    expect(lerSessao(m)).toBeNull()
    // concluída ou encerrada: some do navegador
    gravarSessao(m, s)
    gravarSessao(m, null)
    expect(m.dados.size).toBe(0)
    expect(lerSessao(null)).toBeNull()
  })
})

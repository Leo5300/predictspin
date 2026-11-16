import { describe, expect, it } from 'vitest'

import {
  alternar,
  avancar,
  emLacuna,
  estadoInicial,
  indiceAtual,
  lacunasDaLinha,
  linhaDoTempo,
  mudarVelocidade,
  ordenarJanelas,
  saltar,
} from './replay'

const base = Date.parse('2026-11-14T12:00:00Z')
const janela = (s: number, modo = 'normal') => ({
  medido_em: new Date(base + s * 1000).toISOString(),
  modo,
})

describe('linha do tempo do replay', () => {
  it('ordena as janelas e mede a duração (a última conta inteira)', () => {
    const janelas = [janela(10), janela(0), janela(5)]
    expect(ordenarJanelas(janelas).map((j) => j.medido_em)).toEqual([
      janela(0).medido_em,
      janela(5).medido_em,
      janela(10).medido_em,
    ])
    const l = linhaDoTempo(janelas)
    expect(l.temposS).toEqual([0, 5, 10])
    expect(l.duracaoS).toBe(15)
    expect(l.inicioMs).toBe(base)
    expect(linhaDoTempo([janela(0, 'rapido'), janela(1, 'rapido')]).duracaoS).toBe(2)
    expect(linhaDoTempo([]).duracaoS).toBe(0)
  })

  it('janela atual: a última já medida; −1 antes da primeira', () => {
    const t = [0, 5, 10]
    expect(indiceAtual(t, 0)).toBe(0)
    expect(indiceAtual(t, 4.9)).toBe(0)
    expect(indiceAtual(t, 5)).toBe(1)
    expect(indiceAtual(t, 99)).toBe(2)
    expect(indiceAtual(t, -1)).toBe(-1)
    expect(indiceAtual([], 3)).toBe(-1)
  })

  it('lacuna: vão maior que 2,5 × 5 s', () => {
    const t = [0, 5, 40, 45]
    expect(lacunasDaLinha(t)).toEqual([[10, 40]])
    expect(emLacuna(t, 7)).toBe(false)
    expect(emLacuna(t, 20)).toBe(true)
    expect(emLacuna(t, 41)).toBe(false)
    expect(emLacuna(t, 60)).toBe(false)
  })
})

describe('relógio do replay', () => {
  it('pausado não anda; tocando anda na velocidade escolhida', () => {
    let e = estadoInicial()
    expect(avancar(e, 1, 100)).toBe(e)
    e = alternar(e)
    expect(avancar(e, 1, 100).posicaoS).toBe(1)
    e = mudarVelocidade(e, 16)
    expect(avancar(e, 0.5, 100).posicaoS).toBe(8)
    expect(avancar(mudarVelocidade(e, 4), 2, 100).posicaoS).toBe(8)
  })

  it('pausa guarda a posição; salto prende ao intervalo', () => {
    let e = alternar(estadoInicial())
    e = avancar(e, 3, 100)
    e = alternar(e)
    expect(e).toMatchObject({ tocando: false, posicaoS: 3 })
    expect(saltar(e, 50, 100).posicaoS).toBe(50)
    expect(saltar(e, -5, 100).posicaoS).toBe(0)
    expect(saltar(e, 500, 100)).toMatchObject({ posicaoS: 100, fim: true })
  })

  it('no fim para sozinho; tocar de novo recomeça do início', () => {
    let e = mudarVelocidade(alternar(estadoInicial()), 16)
    e = avancar(e, 10, 100)
    expect(e).toMatchObject({ posicaoS: 100, tocando: false, fim: true })
    e = alternar(e)
    expect(e).toMatchObject({ posicaoS: 0, tocando: true, fim: false })
  })
})

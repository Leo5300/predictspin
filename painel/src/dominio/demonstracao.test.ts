import { describe, expect, it } from 'vitest'

import {
  anuncioDoNivel,
  atalhoDoEvento,
  focoEmCampo,
  formatarContagem,
  nivelDaTecla,
  segundosParaVoltar,
} from './demonstracao'

const evento = (key: string, extra: Partial<Parameters<typeof atalhoDoEvento>[0]> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: document.body as EventTarget,
  ...extra,
})

describe('teclas da demonstração', () => {
  it('1 Normal, 2 Atenção, 3 Alarme, 0 Parar; outra tecla não é atalho', () => {
    expect(nivelDaTecla('1')).toBe('NORMAL')
    expect(nivelDaTecla('2')).toBe('ATENCAO')
    expect(nivelDaTecla('3')).toBe('ALARME')
    expect(nivelDaTecla('0')).toBe('PARADA')
    expect(nivelDaTecla('4')).toBeNull()
    expect(nivelDaTecla('a')).toBeNull()
  })

  it('ignora a tecla com Ctrl, Alt, Meta ou repetindo', () => {
    expect(atalhoDoEvento(evento('2'))).toBe('ATENCAO')
    expect(atalhoDoEvento(evento('2', { ctrlKey: true }))).toBeNull()
    expect(atalhoDoEvento(evento('2', { metaKey: true }))).toBeNull()
    expect(atalhoDoEvento(evento('2', { altKey: true }))).toBeNull()
    expect(atalhoDoEvento(evento('2', { repeat: true }))).toBeNull()
  })

  it('ignora a tecla quando o foco está num campo de texto', () => {
    const campo = document.createElement('input')
    const area = document.createElement('textarea')
    const seletor = document.createElement('select')
    const editavel = document.createElement('div')
    editavel.setAttribute('contenteditable', 'true')
    Object.defineProperty(editavel, 'isContentEditable', { value: true })
    const caixa = document.createElement('div')
    caixa.setAttribute('role', 'combobox')
    for (const alvo of [campo, area, seletor, editavel, caixa]) {
      expect(focoEmCampo(alvo)).toBe(true)
      expect(atalhoDoEvento(evento('3', { target: alvo }))).toBeNull()
    }
    const botao = document.createElement('button')
    expect(focoEmCampo(botao)).toBe(false)
    expect(atalhoDoEvento(evento('3', { target: botao }))).toBe('ALARME')
    expect(focoEmCampo(null)).toBe(false)
  })
})

describe('contagem', () => {
  it('formata mm:ss, arredondando para cima e nunca negativa', () => {
    expect(formatarContagem(300)).toBe('05:00')
    expect(formatarContagem(61)).toBe('01:01')
    expect(formatarContagem(0.2)).toBe('00:01')
    expect(formatarContagem(0)).toBe('00:00')
    expect(formatarContagem(-5)).toBe('00:00')
    expect(formatarContagem(1199)).toBe('19:59')
  })

  it('conta a partir da resposta da API e para em zero', () => {
    expect(segundosParaVoltar(300, 1_000_000, 1_000_000)).toBe(300)
    expect(segundosParaVoltar(300, 1_000_000, 1_090_000)).toBe(210)
    expect(segundosParaVoltar(300, 1_000_000, 2_000_000)).toBe(0)
    expect(segundosParaVoltar(null, 0, 10)).toBeNull()
    expect(segundosParaVoltar(undefined, 0, 10)).toBeNull()
  })

  it('o anúncio leva o nível e o texto da API', () => {
    expect(anuncioDoNivel('ATENCAO', 'A sobe mais que B e C.')).toBe(
      'Demonstração em ATENÇÃO. A sobe mais que B e C.',
    )
  })
})

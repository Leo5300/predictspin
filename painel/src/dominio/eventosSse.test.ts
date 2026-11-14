import { describe, expect, it } from 'vitest'

import { criarLeitorSse, esperaDeReconexaoS } from './eventosSse'

describe('leitor de eventos SSE', () => {
  it('lê um evento com nome e dados', () => {
    const leitor = criarLeitorSse()
    expect(leitor.alimentar('event:janela\ndata:{"id":7}\n\n')).toEqual([
      { tipo: 'evento', nome: 'janela', dados: '{"id":7}' },
    ])
  })

  it('junta um evento que chega cortado em pedaços, inclusive no meio de uma linha', () => {
    const leitor = criarLeitorSse()
    expect(leitor.alimentar('event:jan')).toEqual([])
    expect(leitor.alimentar('ela\ndata:{"id"')).toEqual([])
    expect(leitor.alimentar(':7,"rms_g":0.04}\n')).toEqual([])
    expect(leitor.alimentar('\n')).toEqual([
      { tipo: 'evento', nome: 'janela', dados: '{"id":7,"rms_g":0.04}' },
    ])
  })

  it('devolve vários eventos de um mesmo pedaço, na ordem', () => {
    const leitor = criarLeitorSse()
    const eventos = leitor.alimentar(
      'event:modo_rapido\ndata:{"ativo":false}\n\nevent:janela\ndata:{"id":1}\n\nevent:janela\ndata:{"id":2}\n\n',
    )
    expect(eventos.map((e) => (e.tipo === 'evento' ? `${e.nome}:${e.dados}` : e.tipo))).toEqual([
      'modo_rapido:{"ativo":false}',
      'janela:{"id":1}',
      'janela:{"id":2}',
    ])
  })

  it('comentário de batimento avisa que a conexão está viva e não vira evento', () => {
    const leitor = criarLeitorSse()
    expect(leitor.alimentar(':batimento\n\n')).toEqual([{ tipo: 'batimento' }])
  })

  it('aceita CRLF, inclusive com o par cortado entre dois pedaços', () => {
    const leitor = criarLeitorSse()
    expect(leitor.alimentar('event:ensaio\r\ndata:{"acao":"aberto"}\r')).toEqual([])
    expect(leitor.alimentar('\n\r\n')).toEqual([
      { tipo: 'evento', nome: 'ensaio', dados: '{"acao":"aberto"}' },
    ])
  })

  it('aceita espaço depois dos dois pontos e dados em várias linhas', () => {
    const leitor = criarLeitorSse()
    expect(leitor.alimentar('event: janela\ndata: {"a":1,\ndata: "b":2}\n\n')).toEqual([
      { tipo: 'evento', nome: 'janela', dados: '{"a":1,\n"b":2}' },
    ])
  })

  it('evento sem nome usa "message" e bloco sem dados é ignorado', () => {
    const leitor = criarLeitorSse()
    expect(leitor.alimentar('data:x\n\nevent:vazio\n\n')).toEqual([
      { tipo: 'evento', nome: 'message', dados: 'x' },
    ])
  })

  it('reconexão com espera crescente e teto de 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 99].map(esperaDeReconexaoS)).toEqual([1, 2, 4, 8, 15, 30, 30, 30])
    expect(esperaDeReconexaoS(0)).toBe(1)
  })
})

import {
  emDestaque,
  faltaNaConclusao,
  janelaEmVoltaDaAbertura,
  nomeDoValor,
  ordenarOrdens,
  podeAssumir,
  podeConcluir,
  type StatusOrdem,
} from './ordens'

const os = (id: number, status: StatusOrdem, abertaEm: string, responsavel: string | null = null) => ({
  id,
  status,
  aberta_em: abertaEm,
  responsavel,
})

describe('ordens de serviço', () => {
  it('abertas sem dono no topo, depois abertas com dono, em andamento, concluídas; mais nova antes', () => {
    const lista = ordenarOrdens([
      os(1, 'concluida', '2026-11-24T10:00:00Z', 'Ana'),
      os(2, 'em_andamento', '2026-11-24T09:00:00Z', 'Ana'),
      os(3, 'aberta', '2026-11-24T08:00:00Z', 'Bia'),
      os(4, 'aberta', '2026-11-24T07:00:00Z'),
      os(5, 'aberta', '2026-11-24T11:00:00Z'),
      os(6, 'cancelada', '2026-11-24T12:00:00Z'),
    ])
    expect(lista.map((o) => o.id)).toEqual([5, 4, 3, 2, 1, 6])
  })

  it('destaque só para aberta sem dono; assumir só aberta; concluir aberta ou em andamento', () => {
    expect(emDestaque(os(1, 'aberta', ''))).toBe(true)
    expect(emDestaque(os(1, 'aberta', '', 'Ana'))).toBe(false)
    expect(emDestaque(os(1, 'em_andamento', ''))).toBe(false)
    expect(podeAssumir({ status: 'aberta' })).toBe(true)
    expect(podeAssumir({ status: 'em_andamento' })).toBe(false)
    expect(podeConcluir({ status: 'em_andamento' })).toBe(true)
    expect(podeConcluir({ status: 'aberta' })).toBe(true)
    expect(podeConcluir({ status: 'concluida' })).toBe(false)
  })

  it('nomes para mostrar; valor novo do contrato aparece legível', () => {
    expect(nomeDoValor('ferramenta_desgastada')).toBe('Ferramenta desgastada')
    expect(nomeDoValor('rejeitada')).toBe('Alarme falso')
    expect(nomeDoValor('folga_no_mancal')).toBe('folga no mancal')
    expect(nomeDoValor(null)).toBe('—')
  })

  it('tendência em volta da abertura: 15 min antes e até 15 min depois, sem passar de agora', () => {
    const abertura = Date.parse('2026-11-24T10:00:00Z')
    expect(janelaEmVoltaDaAbertura('2026-11-24T10:00:00Z', abertura + 3600_000)).toEqual({
      inicioS: abertura / 1000 - 900,
      fimS: abertura / 1000 + 900,
    })
    expect(janelaEmVoltaDaAbertura('2026-11-24T10:00:00Z', abertura + 60_000).fimS).toBe(abertura / 1000 + 60)
  })

  it('concluir exige só o retorno', () => {
    expect(faltaNaConclusao({ retorno: null, condicao: 'normal', comentario: 'x' })).toMatch(/havia problema/)
    expect(faltaNaConclusao({ retorno: 'rejeitada', condicao: null, comentario: '' })).toBeNull()
  })
})

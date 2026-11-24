import {
  amostraMaisProxima,
  faixaNormal,
  limitesDoEixo,
  marcasDeTempo,
  periodo,
  PERIODOS,
  quebrarNasLacunas,
  resumoDaTendencia,
  tendenciaDeJanelas,
  tendenciaDeSerie,
  trechos,
  type JanelaDaTendencia,
} from './tendencia'

const T0 = Date.parse('2026-11-24T10:00:00Z') / 1000
const iso = (s: number) => new Date((T0 + s) * 1000).toISOString()

function janela(s: number, rms: number, z?: number, modo = 'normal'): JanelaDaTendencia {
  return {
    medido_em: iso(s),
    modo,
    pontos: { B: { rms_g: rms, ...(z === undefined ? {} : { avaliacao: { z: { rms_g: z } } }) } },
  }
}

describe('períodos (os do painel)', () => {
  it('15 min e 1 h com janelas brutas; 8 h e 24 h agregados', () => {
    expect(PERIODOS.map((p) => `${p.chave}:${p.fonte}`)).toEqual([
      '15min:brutos',
      '1h:brutos',
      '8h:agregado',
      '24h:agregado',
    ])
    expect(periodo('8h').baldes).toBe(480)
  })
})

describe('tendência das janelas brutas', () => {
  it('só janelas normais, em ordem, sem repetir; buraco maior que 2,5 × 5 s quebra a linha', () => {
    const t = tendenciaDeJanelas(
      [janela(10, 0.3, 4), janela(0, 0.1), janela(5, 0.2, 1), janela(5, 0.2, 1), janela(6, 9, 0, 'rapido'), janela(40, 0.25)],
      'B',
    )
    expect(t.janelas).toBe(4)
    expect(t.fonte).toBe('brutos')
    expect(t.amostras.map((a) => a.valor)).toEqual([0.1, 0.2, 0.3, null, 0.25])
    expect(t.amostras.map((a) => a.z)).toEqual([null, 1, 4, null, null])
    expect(t.amostras[3]!.t).toBe(T0 + 15)
  })

  it('ponto ausente na janela vira buraco, não zero', () => {
    const sem: JanelaDaTendencia = { medido_em: iso(5), modo: 'normal', pontos: {} }
    expect(tendenciaDeJanelas([janela(0, 0.1), sem], 'B').amostras.map((a) => a.valor)).toEqual([0.1, null])
  })

  it('vão exatamente no limite não quebra', () => {
    expect(quebrarNasLacunas([{ t: 0, valor: 1, z: null }, { t: 12.5, valor: 1, z: null }], 5)).toHaveLength(2)
  })
})

describe('tendência da série agregada', () => {
  it('meio do intervalo, média do RMS, maior z; intervalo sem janela é buraco', () => {
    const t = tendenciaDeSerie(
      {
        segundos_por_balde: 60,
        intervalos: [
          { inicio: iso(0), fim: iso(60), janelas: 12, pontos: { B: { rms_media_g: 0.2, z_max: { rms_g: 3.5 } } } },
          { inicio: iso(60), fim: iso(120), janelas: 0, pontos: { B: { rms_media_g: 0 } } },
          { inicio: iso(120), fim: iso(180), janelas: 10, pontos: { B: { rms_media_g: 0.3 } } },
        ],
      },
      'B',
    )
    expect(t).toMatchObject({ fonte: 'agregado', passoS: 60, janelas: 22 })
    expect(t.amostras).toEqual([
      { t: T0 + 30, valor: 0.2, z: 3.5 },
      { t: T0 + 90, valor: null, z: null },
      { t: T0 + 150, valor: 0.3, z: null },
    ])
  })
})

describe('faixa normal', () => {
  const limites = { z_atencao: 3, z_alarme: 6 }

  it('típico ± z de atenção × σ; alarme em típico + z de alarme × σ; base nunca abaixo de zero', () => {
    expect(faixaNormal({ tipico: 0.2, sigma_efetivo: 0.01 }, limites)).toEqual({
      centro: 0.2,
      inferior: expect.closeTo(0.17, 10),
      atencao: expect.closeTo(0.23, 10),
      alarme: expect.closeTo(0.26, 10),
    })
    expect(faixaNormal({ tipico: 0.02, sigma_efetivo: 0.01 }, limites)?.inferior).toBe(0)
  })

  it('sem típico, sem σ, σ zero ou sem limites: nenhuma faixa', () => {
    expect(faixaNormal({ tipico: null, sigma_efetivo: 0.01 }, limites)).toBeNull()
    expect(faixaNormal({ tipico: 0.2, sigma_efetivo: null }, limites)).toBeNull()
    expect(faixaNormal({ tipico: 0.2 }, limites)).toBeNull()
    expect(faixaNormal({ tipico: 0.2, sigma_efetivo: 0 }, limites)).toBeNull()
    expect(faixaNormal({ tipico: 0.2, sigma_efetivo: 0.01 }, null)).toBeNull()
    expect(faixaNormal(undefined, limites)).toBeNull()
  })
})

describe('eixos e cursor', () => {
  it('teto redondo acima do maior valor', () => {
    expect(limitesDoEixo([0.26, null, 0.1])).toEqual([0, 0.3])
    expect(limitesDoEixo([2.9])).toEqual([0, 4])
    expect(limitesDoEixo([null, 0])).toEqual([0, 1])
  })

  it('marcas em horários redondos da hora local, no máximo o pedido', () => {
    const inicio = Date.parse('2026-11-24T10:02:30Z') / 1000
    const marcas = marcasDeTempo(inicio, inicio + 15 * 60, 4)
    expect(marcas.length).toBeLessThanOrEqual(4)
    expect(marcas.every((t) => t % 300 === 0)).toBe(true)
    // fuso de −3 h: as marcas de 1 h caem na hora cheia local
    const dia = marcasDeTempo(inicio, inicio + 24 * 3600, 6, -3 * 3600)
    expect(dia.every((t) => (t - 3 * 3600) % 3600 === 0)).toBe(true)
    expect(marcasDeTempo(10, 5, 4)).toEqual([])
  })

  it('cursor vai para a amostra com valor mais perto; sem valores, nenhuma', () => {
    const amostras = [
      { t: 0, valor: 1, z: null },
      { t: 10, valor: null, z: null },
      { t: 20, valor: 2, z: null },
    ]
    expect(amostraMaisProxima(amostras, 11)).toBe(2)
    expect(amostraMaisProxima(amostras, 9)).toBe(0)
    expect(amostraMaisProxima([{ t: 0, valor: null, z: null }], 0)).toBeNull()
  })

  it('trechos separados pelos buracos', () => {
    const v = (valor: number | null) => ({ t: 0, valor, z: null })
    expect(trechos([v(1), v(2), v(null), v(3), v(null)]).map((t) => t.length)).toEqual([2, 1])
  })
})

describe('resumo para o leitor de tela', () => {
  const g = (v: number) => `${v} g`
  const limites = { z_atencao: 3, z_alarme: 6 }

  it('faixa de valores, último e quantos instantes em desvio', () => {
    const t = tendenciaDeJanelas([janela(0, 0.1, 1), janela(5, 0.4, 7), janela(10, 0.3, 4)], 'B')
    expect(resumoDaTendencia(t, limites, g)).toBe('RMS de 0.1 g a 0.4 g, último 0.3 g; 1 em alarme, 1 em atenção.')
    expect(resumoDaTendencia(t, null, g)).toBe('RMS de 0.1 g a 0.4 g, último 0.3 g; nenhum instante em desvio.')
  })

  it('sem janelas', () => {
    expect(resumoDaTendencia(tendenciaDeJanelas([], 'B'), limites, g)).toBe('Sem janelas no período.')
  })
})

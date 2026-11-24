import {
  avisosDoPreVoo,
  condicoesDaEtapa,
  fita,
  formatarCronometro,
  gradeDeCobertura,
  nomeDe,
  porQueNaoGrava,
  preVoo,
  proximaSugerida,
  rotacaoDaEtapa,
  ROTULO_CONDICAO,
  TRACOS_DA_FITA,
} from './coleta'

const ETAPAS = ['T0', 'T1', 'T2', 'T3']
const CONDICOES = ['normal', 'ferramenta_desgastada', 'sensor_solto']
const item = (etapa: string, condicao: string, rotacao: number, validos: number, uso = 'treino') => ({
  etapa,
  condicao,
  rotacao_alvo_rpm: rotacao,
  ensaios_validos: validos,
  uso,
})

describe('grade de cobertura (protocolo do painel, contagem da API)', () => {
  const grade = gradeDeCobertura(
    [item('T0', 'normal', 0, 3), item('T1', 'normal', 560, 1), item('T3', 'sensor_solto', 560, 0, 'validacao'),
      item('T1', 'ferramenta_desgastada', 560, 9)],
    [1120, 560, 560, 0],
    3,
    ETAPAS,
    CONDICOES,
  )

  it('T0 só a 0 rpm; T1 e T2 só normal; T3 todas as condições; rotações crescentes', () => {
    expect(grade.map((c) => `${c.etapa}|${c.condicao}|${c.rotacao}`)).toEqual([
      'T0|normal|0',
      'T1|normal|560',
      'T1|normal|1120',
      'T2|normal|560',
      'T2|normal|1120',
      'T3|normal|560',
      'T3|normal|1120',
      'T3|ferramenta_desgastada|560',
      'T3|ferramenta_desgastada|1120',
      'T3|sensor_solto|560',
      'T3|sensor_solto|1120',
    ])
  })

  it('contagem e uso vêm da API; faltam até a meta', () => {
    expect(grade[0]).toMatchObject({ validos: 3, faltam: 0 })
    expect(grade[1]).toMatchObject({ validos: 1, faltam: 2 })
    expect(grade.find((c) => c.condicao === 'sensor_solto')?.uso).toBe('validacao')
  })

  it('sugere a célula mais atrasada; no empate, a primeira; grade completa, nenhuma', () => {
    expect(proximaSugerida(grade)).toMatchObject({ etapa: 'T1', condicao: 'normal', rotacao: 1120 })
    expect(proximaSugerida(grade.map((c) => ({ ...c, faltam: 0 })))).toBeNull()
  })

  it('condição só no corte; T0 é torno parado; nome legível para valor novo', () => {
    expect(condicoesDaEtapa('T1', CONDICOES)).toEqual(['normal'])
    expect(condicoesDaEtapa('T3', CONDICOES)).toEqual(CONDICOES)
    expect(rotacaoDaEtapa('T0', 1120)).toBe(0)
    expect(rotacaoDaEtapa('T3', 1120)).toBe(1120)
    expect(nomeDe(ROTULO_CONDICAO, 'folga_no_mancal')).toBe('folga no mancal')
  })
})

describe('pré-voo', () => {
  const pontos = ['A', 'B', 'C']
  const janela = (rpm: number, presentes = pontos) => ({
    rotacao_rpm: rpm,
    pontos: Object.fromEntries(presentes.map((p) => [p, {}])),
  })

  it('sem dado vivo: A, B, C, FC-51 e rotação bloqueiam, e o REC diz por quê', () => {
    const itens = preVoo({ janela: null, etapa: 'T1', rotacaoAlvo: 560, pontos })
    expect(itens.map((i) => `${i.chave}:${i.estado}`)).toEqual([
      'A:bloqueia',
      'B:bloqueia',
      'C:bloqueia',
      'fc51:bloqueia',
      'rotacao:bloqueia',
    ])
    expect(porQueNaoGrava(itens, false)).toBe('Ponto A: sem dado vivo. Confira se o dispositivo está ligado e no Wi-Fi.')
  })

  it('girando na rotação: tudo ok e grava', () => {
    const itens = preVoo({ janela: janela(570), etapa: 'T1', rotacaoAlvo: 560, pontos })
    expect(itens.every((i) => i.estado === 'ok')).toBe(true)
    expect(porQueNaoGrava(itens, false)).toBeNull()
    expect(porQueNaoGrava(itens, true)).toMatch(/Sem conexão/)
  })

  it('ponto faltando, rotação fora e FC-51 sem voltas só avisam, com o que fazer', () => {
    const fora = preVoo({ janela: janela(700, ['A', 'C']), etapa: 'T3', rotacaoAlvo: 560, pontos })
    expect(fora.find((i) => i.chave === 'B')).toMatchObject({ estado: 'aviso', oQueFazer: expect.stringContaining('sensor B') })
    expect(fora.find((i) => i.chave === 'rotacao')?.estado).toBe('aviso')
    expect(avisosDoPreVoo(fora)).toEqual(['Ponto B', 'Rotação perto de 560 rpm'])
    const parado = preVoo({ janela: janela(0), etapa: 'T1', rotacaoAlvo: 560, pontos })
    expect(parado.find((i) => i.chave === 'fc51')).toMatchObject({ estado: 'aviso', detalhe: 'nenhuma volta contada' })
    expect(porQueNaoGrava(parado, false)).toBeNull()
  })

  it('T0: torno parado é ok; girando avisa', () => {
    expect(preVoo({ janela: janela(0), etapa: 'T0', rotacaoAlvo: 0, pontos }).every((i) => i.estado === 'ok')).toBe(true)
    expect(preVoo({ janela: janela(560), etapa: 'T0', rotacaoAlvo: 0, pontos }).at(-1)?.estado).toBe('aviso')
  })
})

describe('gravação', () => {
  it('cronômetro em minutos e segundos; passando de 1 h, com a hora', () => {
    expect(formatarCronometro(0)).toBe('00:00')
    expect(formatarCronometro(65.9)).toBe('01:05')
    expect(formatarCronometro(3725)).toBe('1:02:05')
    expect(formatarCronometro(-3)).toBe('00:00')
  })

  it('a fita guarda só as últimas janelas', () => {
    const janelas = Array.from({ length: TRACOS_DA_FITA + 5 }, (_, i) => ({ id: i, saturou: false }))
    expect(fita(janelas)).toHaveLength(TRACOS_DA_FITA)
    expect(fita(janelas)[0]?.id).toBe(5)
  })
})

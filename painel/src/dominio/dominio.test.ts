import { describe, expect, it } from 'vitest'

import {
  TEMPO_PARA_ACORDAR_S,
  esperaDaTentativaS,
  estadoDaConexao,
  statusDeApiAcordando,
} from './conexao'
import { gerarCsv, nomeDeArquivo } from './csv'
import {
  alcanceDaRegua,
  corDaCelula,
  escalaDaLinha,
  limitesDoEixo,
  marcasDeTempo,
  nivelDeCinza,
  posicaoNaRegua,
} from './escalas'
import { avaliar, estadoDaMaquina, piorAvaliacao, type Referencia } from './estado'
import {
  LIMIAR_VELHO_NORMAL_S,
  LIMIAR_VELHO_RAPIDO_S,
  frescor,
  idadeEmSegundos,
  limiarVelhoS,
} from './idade'
import { detectarLacunas, limiteDeLacunaS, quebrarNasLacunas } from './lacunas'
import {
  DURACAO_MODO_RAPIDO_S,
  desvioPeloPrazo,
  deveRenovar,
  modoRapidoAtivo,
  segundosRestantes,
} from './modoRapido'
import { podeAbrir } from './papeis'
import {
  PERIODOS_MAPA,
  PERIODOS_TENDENCIA,
  fimAlinhadoMs,
  planoDoPeriodo,
  validarPeriodo,
} from './periodos'
import { ordenarCodigos, rotuloDoPapel } from './pontos'

describe('idade do dado e limiares', () => {
  const observacao = { idadeNaObservacaoS: 3, observadoEmMs: 10_000 }

  it('conta a idade a partir da observação', () => {
    expect(idadeEmSegundos(observacao, 10_000)).toBe(3)
    expect(idadeEmSegundos(observacao, 14_500)).toBe(7.5)
    // relógio que anda para trás não rejuvenesce o dado
    expect(idadeEmSegundos(observacao, 9_000)).toBe(3)
  })

  it('dado fica velho depois de 15 s no modo normal', () => {
    expect(frescor(observacao, 10_000 + 11_900, LIMIAR_VELHO_NORMAL_S)).toBe('vivo')
    expect(frescor(observacao, 10_000 + 12_100, LIMIAR_VELHO_NORMAL_S)).toBe('velho')
    expect(frescor(null, 0, LIMIAR_VELHO_NORMAL_S)).toBe('ausente')
  })

  it('o limiar de 4 s só vale com a máquina em modo rápido e a última janela rápida', () => {
    expect(limiarVelhoS('rapido', true)).toBe(LIMIAR_VELHO_RAPIDO_S)
    expect(limiarVelhoS('normal', true)).toBe(LIMIAR_VELHO_NORMAL_S)
    expect(limiarVelhoS('rapido', false)).toBe(LIMIAR_VELHO_NORMAL_S)
    expect(limiarVelhoS('normal', false)).toBe(LIMIAR_VELHO_NORMAL_S)
    expect(frescor({ idadeNaObservacaoS: 0, observadoEmMs: 0 }, 4_100, LIMIAR_VELHO_RAPIDO_S)).toBe(
      'velho',
    )
  })
})

describe('estado da máquina e avaliação', () => {
  it('operando, parado e sem dados', () => {
    expect(estadoDaMaquina('vivo', 1180)).toBe('operando')
    expect(estadoDaMaquina('vivo', 0)).toBe('parado')
    expect(estadoDaMaquina('velho', 1180)).toBe('sem_dados')
    expect(estadoDaMaquina('ausente', null)).toBe('sem_dados')
    expect(estadoDaMaquina('vivo', null)).toBe('sem_dados')
  })

  const referencia: Referencia = { centro: 0.05, tolerancia: 0.01, atencao: 0.08, alarme: 0.12 }

  it('sem referência a avaliação é neutra; com referência compara com os limites', () => {
    expect(avaliar(0.3, null)).toBe('sem_referencia')
    expect(avaliar(null, referencia)).toBe('sem_referencia')
    expect(avaliar(0.05, referencia)).toBe('normal')
    expect(avaliar(0.08, referencia)).toBe('atencao')
    expect(avaliar(0.12, referencia)).toBe('alarme')
  })

  it('a pior avaliação resume a máquina', () => {
    expect(piorAvaliacao(['normal', 'alarme', 'atencao'])).toBe('alarme')
    expect(piorAvaliacao(['normal', 'sem_referencia'])).toBe('normal')
    expect(piorAvaliacao([])).toBe('sem_referencia')
  })
})

describe('escala do mapa de ordens', () => {
  it('cada linha vai de zero ao próprio máximo', () => {
    const escala = escalaDaLinha([0.02, null, 0.08, undefined, 0.05])
    expect(escala).toEqual({ minimo: 0.02, maximo: 0.08 })
    expect(nivelDeCinza(0.02, escala)).toBe(0)
    expect(nivelDeCinza(0.05, escala)).toBeCloseTo(0.5)
    expect(nivelDeCinza(0.08, escala)).toBe(1)
    expect(nivelDeCinza(0.5, escala)).toBe(1)
    expect(nivelDeCinza(0, escala)).toBe(0)
  })

  it('linha vazia ou zerada não divide por zero', () => {
    expect(escalaDaLinha([])).toEqual({ minimo: 0, maximo: 0 })
    // linha constante: há dado, mas não há variação a mostrar
    expect(nivelDeCinza(0.03, escalaDaLinha([0.03, 0.03]))).toBe(0.5)
    expect(nivelDeCinza(Number.NaN, { minimo: 0, maximo: 1 })).toBe(0)
  })

  it('lacuna, cinza sem referência e cor de desvio com referência', () => {
    const escala = { minimo: 0, maximo: 0.1 }
    const referencia: Referencia = { centro: 0.04, tolerancia: 0.01, atencao: 0.06, alarme: 0.09 }
    expect(corDaCelula(null, escala)).toEqual({ tipo: 'lacuna' })
    expect(corDaCelula(0.05, escala)).toEqual({ tipo: 'cinza', nivel: 0.5 })
    expect(corDaCelula(0.095, escala)).toEqual({ tipo: 'cinza', nivel: 0.95 })
    expect(corDaCelula(0.05, escala, referencia)).toEqual({ tipo: 'cinza', nivel: 0.5 })
    expect(corDaCelula(0.07, escala, referencia)).toEqual({ tipo: 'atencao' })
    expect(corDaCelula(0.095, escala, referencia)).toEqual({ tipo: 'alarme' })
  })

  it('régua de desvio: centro na referência e ponteiro preso nas pontas', () => {
    const referencia: Referencia = { centro: 0.05, tolerancia: 0.01, atencao: 0.08, alarme: 0.1 }
    expect(alcanceDaRegua(referencia)).toBeCloseTo(0.0625)
    expect(posicaoNaRegua(0.05, referencia)).toBe(0.5)
    expect(posicaoNaRegua(0.1, referencia)).toBeCloseTo(0.9)
    expect(posicaoNaRegua(9, referencia)).toBe(1)
    expect(posicaoNaRegua(-9, referencia)).toBe(0)
    expect(posicaoNaRegua(Number.NaN, referencia)).toBe(0.5)
  })

  it('limites do eixo são redondos e contêm o máximo', () => {
    expect(limitesDoEixo([0.081, 0.04])).toEqual([0, 0.1])
    expect(limitesDoEixo([1180])).toEqual([0, 2000])
    expect(limitesDoEixo([null, undefined])).toEqual([0, 1])
    expect(limitesDoEixo([0.19])).toEqual([0, 0.2])
    // 0,26 vai a 0,3 (marcas de 0,075), não a 0,5 com metade do gráfico vazia
    expect(limitesDoEixo([0.26])).toEqual([0, 0.3])
  })
})

describe('lacunas', () => {
  it('detecta espaço maior que 2,5 passos', () => {
    const limite = limiteDeLacunaS(5)
    expect(limite).toBe(12.5)
    expect(detectarLacunas([0, 5, 10, 40, 45], limite)).toEqual([{ inicioS: 10, fimS: 40 }])
    expect(detectarLacunas([0, 5, 17], limite)).toEqual([])
    expect(detectarLacunas([], limite)).toEqual([])
  })

  it('quebra a linha do gráfico na lacuna em vez de ligar os pontos', () => {
    const { temposS, series } = quebrarNasLacunas([0, 5, 40, 45], [[1, 2, 3, 4]], 12.5)
    expect(temposS).toEqual([0, 5, 10, 40, 45])
    expect(series).toEqual([[1, 2, null, 3, 4]])
  })

  it('sem lacuna devolve os mesmos pontos', () => {
    const { temposS, series } = quebrarNasLacunas(
      [0, 5, 10],
      [
        [1, null, 3],
        [4, 5, 6],
      ],
      12.5,
    )
    expect(temposS).toEqual([0, 5, 10])
    expect(series).toEqual([
      [1, null, 3],
      [4, 5, 6],
    ])
  })
})

describe('prazo do modo rápido', () => {
  const agora = Date.parse('2026-11-12T12:00:00Z')

  it('segundos restantes no relógio do servidor', () => {
    expect(segundosRestantes('2026-11-12T12:02:00Z', agora)).toBe(120)
    expect(segundosRestantes('2026-11-12T11:59:00Z', agora)).toBe(0)
    expect(segundosRestantes(null, agora)).toBe(0)
    expect(segundosRestantes('isto não é data', agora)).toBe(0)
    expect(modoRapidoAtivo('2026-11-12T12:00:01Z', agora)).toBe(true)
    expect(modoRapidoAtivo(undefined, agora)).toBe(false)
  })

  it('renova nos últimos 30 s, e só enquanto ainda vale', () => {
    expect(deveRenovar(120)).toBe(false)
    expect(deveRenovar(30)).toBe(true)
    expect(deveRenovar(1)).toBe(true)
    expect(deveRenovar(0)).toBe(false)
  })

  it('estima a diferença de relógio pela resposta de ligar', () => {
    // o relógio do navegador está 90 s atrasado em relação ao do servidor
    const agoraCliente = agora - 90_000
    const prazo = new Date(agora + DURACAO_MODO_RAPIDO_S * 1000).toISOString()
    expect(desvioPeloPrazo(prazo, agoraCliente)).toBe(90_000)
  })
})

describe('conexão com a API', () => {
  it('API acordando é diferente de sem conexão', () => {
    expect(estadoDaConexao({ navegadorConectado: true, falhandoDesdeMs: null }, 0)).toBe('ok')
    expect(estadoDaConexao({ navegadorConectado: true, falhandoDesdeMs: 0 }, 30_000)).toBe(
      'acordando',
    )
    expect(
      estadoDaConexao(
        { navegadorConectado: true, falhandoDesdeMs: 0 },
        (TEMPO_PARA_ACORDAR_S + 1) * 1000,
      ),
    ).toBe('sem_conexao')
    expect(estadoDaConexao({ navegadorConectado: false, falhandoDesdeMs: null }, 0)).toBe(
      'sem_conexao',
    )
  })

  it('espera crescente entre tentativas, com teto', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map(esperaDaTentativaS)).toEqual([2, 3, 5, 8, 10, 15, 15, 15])
    expect(esperaDaTentativaS(0)).toBe(2)
  })

  it('502, 503 e 504 são do proxy enquanto a API sobe', () => {
    expect([502, 503, 504].every(statusDeApiAcordando)).toBe(true)
    expect([500, 404, 401, 200].some(statusDeApiAcordando)).toBe(false)
  })
})

describe('períodos', () => {
  it('curtos usam dados brutos e longos a série agregada', () => {
    expect(PERIODOS_TENDENCIA.map((p) => [p.chave, p.fonte])).toEqual([
      ['15min', 'brutos'],
      ['1h', 'brutos'],
      ['8h', 'agregado'],
      ['24h', 'agregado'],
    ])
    expect(PERIODOS_TENDENCIA.every((p) => p.baldes <= 600)).toBe(true)
    expect(PERIODOS_MAPA.map((p) => p.segundos / p.baldes)).toEqual([15, 30, 60])
  })

  it('período personalizado escolhe a fonte pelo tamanho', () => {
    expect(planoDoPeriodo(30 * 60)).toEqual({ fonte: 'brutos', baldes: 0 })
    expect(planoDoPeriodo(3 * 3600)).toEqual({ fonte: 'agregado', baldes: 180 })
    expect(planoDoPeriodo(5 * 24 * 3600)).toEqual({ fonte: 'agregado', baldes: 600 })
    expect(planoDoPeriodo(61 * 60).baldes).toBe(61)
  })

  it('valida o período personalizado', () => {
    const agora = Date.parse('2026-11-12T12:00:00Z')
    const hora = 3_600_000
    expect(validarPeriodo(agora - hora, agora, agora)).toBeNull()
    expect(validarPeriodo(Number.NaN, agora, agora)).toBe('incompleto')
    expect(validarPeriodo(agora, agora - hora, agora)).toBe('invertido')
    expect(validarPeriodo(agora + hora, agora + 2 * hora, agora)).toBe('no_futuro')
    expect(validarPeriodo(agora - 40 * 24 * hora, agora, agora)).toBe('longo_demais')
  })

  it('alinha o fim do período ao passo', () => {
    expect(fimAlinhadoMs(61_000, 15)).toBe(75_000)
    expect(fimAlinhadoMs(60_000, 15)).toBe(60_000)
  })
})

describe('pontos, papéis e CSV', () => {
  it('papel do ponto por extenso e códigos em ordem estável', () => {
    expect(rotuloDoPapel('ferramenta')).toBe('ferramenta–peça')
    expect(rotuloDoPapel('outro')).toBe('outro')
    expect(rotuloDoPapel(null)).toBe('')
    expect(ordenarCodigos(['C', 'A', 'B'])).toEqual(['A', 'B', 'C'])
  })

  it('operador não abre coleta nem ensaios', () => {
    expect(podeAbrir('OPERADOR', 'visao_geral')).toBe(true)
    expect(podeAbrir('OPERADOR', 'coleta')).toBe(false)
    expect(podeAbrir('OPERADOR', 'ensaios')).toBe(false)
    expect(podeAbrir('TECNICO', 'coleta')).toBe(true)
    expect(podeAbrir('ADMIN', 'ensaios')).toBe(true)
    expect(podeAbrir(null, 'visao_geral')).toBe(false)
  })

  it('CSV com ponto e vírgula, vírgula decimal e aspas quando preciso', () => {
    const csv = gerarCsv(
      ['medido_em', 'rms_g', 'saturou', 'ensaio'],
      [
        ['2026-11-12T12:00:00Z', 0.045, false, 'TORNO-01-T1-00001'],
        ['2026-11-12T12:00:05Z', null, true, 'com ; e "aspas"'],
      ],
    )
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual([
      'medido_em;rms_g;saturou;ensaio',
      '2026-11-12T12:00:00Z;0,045;não;TORNO-01-T1-00001',
      '2026-11-12T12:00:05Z;;sim;"com ; e ""aspas"""',
      '',
    ])
    expect(nomeDeArquivo(['TORNO-01', 'ponto A', '15 min'])).toBe('TORNO-01_ponto-A_15-min.csv')
  })
})

describe('marcas do eixo de tempo', () => {
  it('caem em horários redondos e respeitam o máximo de marcas', () => {
    // 15 min começando em 04:02:58 (UTC), no máximo 6 marcas: passo de 5 min
    const inicio = Date.UTC(2026, 10, 14, 4, 2, 58) / 1000
    const { marcas, passoS } = marcasDeTempo(inicio, inicio + 900, 6)
    expect(passoS).toBe(300)
    expect(marcas.map((t) => new Date(t * 1000).toISOString().slice(11, 19))).toEqual([
      '04:05:00',
      '04:10:00',
      '04:15:00',
    ])
  })

  it('alinham pela hora local e não quebram com período vazio', () => {
    const inicio = Date.UTC(2026, 10, 14, 0, 30, 0) / 1000
    // 8 h com no máximo 3 marcas em UTC−3: passo de 3 h alinhado às 00, 03, 06... locais
    const { marcas, passoS } = marcasDeTempo(inicio, inicio + 8 * 3600, 3, -3 * 3600)
    expect(passoS).toBe(10_800)
    expect(marcas.map((t) => new Date((t - 3 * 3600) * 1000).getUTCHours())).toEqual([0, 3])
    expect(marcasDeTempo(10, 10, 5).marcas).toEqual([])
  })
})

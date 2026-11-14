/**
 * Monta os dados do gráfico de tendência de um ponto, a partir das janelas brutas (períodos curtos)
 * ou da série agregada (períodos longos). Em nenhum dos dois casos um valor é inventado: onde não
 * há janela, a série fica nula e a linha é interrompida.
 */
import type { Ensaio, Janela, SerieAgregada } from '@/api/tipos'

import { PASSO_NORMAL_S, limiteDeLacunaS, quebrarNasLacunas } from './lacunas'
import type { FonteDaTendencia } from './periodos'

export type DadosDaTendencia = {
  fonte: FonteDaTendencia
  /** Segundos entre amostras: 5 s nas janelas brutas, o tamanho do intervalo no agregado. */
  passoS: number
  temposS: number[]
  rms: (number | null)[]
  pico: (number | null)[]
  curtose: (number | null)[]
  o1x: (number | null)[]
  o2x: (number | null)[]
  o3x: (number | null)[]
  rotacao: (number | null)[]
  /** Instantes das amostras em que houve saturação. */
  saturadasS: number[]
  /** Número de janelas representadas (no agregado, a soma dos intervalos). */
  janelas: number
}

export type FaixaDeEnsaio = { inicioS: number; fimS: number; rotulo: string }

const VAZIA: DadosDaTendencia = {
  fonte: 'brutos',
  passoS: PASSO_NORMAL_S,
  temposS: [],
  rms: [],
  pico: [],
  curtose: [],
  o1x: [],
  o2x: [],
  o3x: [],
  rotacao: [],
  saturadasS: [],
  janelas: 0,
}

const segundos = (iso: string) => Date.parse(iso) / 1000

/** Junta listas de janelas sem repetir, em ordem de medição. */
export function unirJanelas(...listas: readonly (readonly Janela[])[]): Janela[] {
  const porId = new Map<number, Janela>()
  for (const lista of listas) for (const janela of lista) porId.set(janela.id, janela)
  return [...porId.values()].sort((a, b) => Date.parse(a.medido_em) - Date.parse(b.medido_em))
}

/**
 * Tendência com dados brutos: uma amostra por janela normal do ponto. Janelas do modo rápido ficam
 * fora (elas só aparecem no gráfico ao vivo). Onde faltam janelas, a linha é quebrada.
 */
export function tendenciaDeJanelas(janelas: readonly Janela[], codigo: string): DadosDaTendencia {
  const normais = janelas.filter((j) => j.modo === 'normal')
  if (normais.length === 0) return VAZIA
  const tempos = normais.map((j) => segundos(j.medido_em))
  const valor = (chave: 'rms_g' | 'pico_g' | 'curtose' | 'o1x' | 'o2x' | 'o3x') =>
    normais.map((j) => j.pontos[codigo]?.[chave] ?? null)
  const quebrado = quebrarNasLacunas(
    tempos,
    [
      valor('rms_g'),
      valor('pico_g'),
      valor('curtose'),
      valor('o1x'),
      valor('o2x'),
      valor('o3x'),
      normais.map((j) => j.rotacao_rpm),
    ],
    limiteDeLacunaS(PASSO_NORMAL_S),
  )
  const [rms = [], pico = [], curtose = [], o1x = [], o2x = [], o3x = [], rotacao = []] =
    quebrado.series
  return {
    fonte: 'brutos',
    passoS: PASSO_NORMAL_S,
    temposS: quebrado.temposS,
    rms,
    pico,
    curtose,
    o1x,
    o2x,
    o3x,
    rotacao,
    saturadasS: normais.filter((j) => j.saturou).map((j) => segundos(j.medido_em)),
    janelas: normais.length,
  }
}

/**
 * Tendência agregada: uma amostra por intervalo, no meio dele. RMS, curtose e ordens são a média
 * do intervalo; o pico é o máximo. Intervalo sem janela fica nulo (lacuna).
 */
export function tendenciaDeSerie(serie: SerieAgregada, codigo: string): DadosDaTendencia {
  const dados: DadosDaTendencia = { ...VAZIA, fonte: 'agregado', passoS: serie.segundos_por_balde }
  const saida = {
    temposS: [] as number[],
    rms: [] as (number | null)[],
    pico: [] as (number | null)[],
    curtose: [] as (number | null)[],
    o1x: [] as (number | null)[],
    o2x: [] as (number | null)[],
    o3x: [] as (number | null)[],
    rotacao: [] as (number | null)[],
    saturadasS: [] as number[],
  }
  let janelas = 0
  for (const intervalo of serie.intervalos) {
    const meio = (segundos(intervalo.inicio) + segundos(intervalo.fim)) / 2
    const ponto = intervalo.pontos[codigo]
    saida.temposS.push(meio)
    saida.rms.push(ponto?.rms_media_g ?? null)
    saida.pico.push(ponto?.pico_max_g ?? null)
    saida.curtose.push(ponto?.curtose_media ?? null)
    saida.o1x.push(ponto?.o1x_media ?? null)
    saida.o2x.push(ponto?.o2x_media ?? null)
    saida.o3x.push(ponto?.o3x_media ?? null)
    saida.rotacao.push(intervalo.janelas > 0 ? intervalo.rotacao_media_rpm : null)
    if (intervalo.saturou) saida.saturadasS.push(meio)
    janelas += intervalo.janelas
  }
  return { ...dados, ...saida, janelas }
}

/** Faixas de ensaio a partir das próprias janelas: trechos seguidos com o mesmo código. */
export function faixasDasJanelas(janelas: readonly Janela[]): FaixaDeEnsaio[] {
  const faixas: FaixaDeEnsaio[] = []
  let atual: FaixaDeEnsaio | null = null
  for (const janela of janelas) {
    const t = segundos(janela.medido_em)
    if (janela.ensaio_codigo && atual?.rotulo === janela.ensaio_codigo) {
      atual.fimS = t
      continue
    }
    atual = janela.ensaio_codigo ? { inicioS: t, fimS: t, rotulo: janela.ensaio_codigo } : null
    if (atual) faixas.push(atual)
  }
  return faixas
}

/** Faixas de ensaio a partir da lista de ensaios (início e fim exatos), recortadas ao período. */
export function faixasDosEnsaios(
  ensaios: readonly Ensaio[],
  deS: number,
  ateS: number,
  agoraS: number,
): FaixaDeEnsaio[] {
  return ensaios
    .map((ensaio) => ({
      inicioS: segundos(ensaio.iniciado_em),
      fimS: ensaio.encerrado_em ? segundos(ensaio.encerrado_em) : agoraS,
      rotulo: ensaio.descartado ? `${ensaio.codigo} (descartado)` : ensaio.codigo,
    }))
    .filter((faixa) => faixa.fimS > deS && faixa.inicioS < ateS)
    .map((faixa) => ({
      ...faixa,
      inicioS: Math.max(faixa.inicioS, deS),
      fimS: Math.min(faixa.fimS, ateS),
    }))
    .sort((a, b) => a.inicioS - b.inicioS)
}

/** O que está no gráfico, em linhas para o CSV (as quebras de lacuna não são linhas). */
export function linhasParaCsv(dados: DadosDaTendencia, faixas: readonly FaixaDeEnsaio[]) {
  const colunas = [
    'instante_utc',
    'fonte',
    dados.fonte === 'agregado' ? 'rms_media_g' : 'rms_g',
    dados.fonte === 'agregado' ? 'pico_max_g' : 'pico_g',
    dados.fonte === 'agregado' ? 'curtose_media' : 'curtose',
    dados.fonte === 'agregado' ? 'o1x_media_g' : 'o1x_g',
    dados.fonte === 'agregado' ? 'o2x_media_g' : 'o2x_g',
    dados.fonte === 'agregado' ? 'o3x_media_g' : 'o3x_g',
    dados.fonte === 'agregado' ? 'rotacao_media_rpm' : 'rotacao_rpm',
    'saturou',
    'ensaio',
  ]
  const saturadas = new Set(dados.saturadasS)
  const linhas: (string | number | boolean | null)[][] = []
  dados.temposS.forEach((t, i) => {
    const rms = dados.rms[i] ?? null
    const rotacao = dados.rotacao[i] ?? null
    if (rms === null && rotacao === null) return
    linhas.push([
      new Date(t * 1000).toISOString(),
      dados.fonte === 'agregado' ? `agregado ${dados.passoS} s` : 'janela',
      rms,
      dados.pico[i] ?? null,
      dados.curtose[i] ?? null,
      dados.o1x[i] ?? null,
      dados.o2x[i] ?? null,
      dados.o3x[i] ?? null,
      rotacao,
      saturadas.has(t),
      faixas.find((f) => t >= f.inicioS && t <= f.fimS)?.rotulo ?? null,
    ])
  })
  return { colunas, linhas }
}

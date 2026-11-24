/**
 * Tendência do RMS de um ponto (detalhe do ponto e da OS), com as regras do painel
 * (painel/src/dominio/tendencia.ts, lacunas.ts, escalas.ts e periodos.ts):
 *  - 15 min e 1 h com as janelas brutas, só as normais (5 s); 8 h e 24 h com a série agregada da API
 *    (média do RMS em cada intervalo, no meio dele);
 *  - vão maior que 2,5 × o passo quebra a linha: buraco de dado aparece como buraco;
 *  - a cor só marca desvio, pelo z da própria API (z da janela; no agregado, o maior z do intervalo).
 *    O app não recalcula o estado de nada.
 */

export type ChavePeriodo = '15min' | '1h' | '8h' | '24h'

export type Periodo = {
  chave: ChavePeriodo
  rotulo: string
  segundos: number
  fonte: 'brutos' | 'agregado'
  /** Só no agregado: em quantos intervalos a API divide o período. */
  baldes: number
}

export const PERIODOS: readonly Periodo[] = [
  { chave: '15min', rotulo: '15 min', segundos: 15 * 60, fonte: 'brutos', baldes: 0 },
  { chave: '1h', rotulo: '1 h', segundos: 60 * 60, fonte: 'brutos', baldes: 0 },
  { chave: '8h', rotulo: '8 h', segundos: 8 * 60 * 60, fonte: 'agregado', baldes: 480 },
  { chave: '24h', rotulo: '24 h', segundos: 24 * 60 * 60, fonte: 'agregado', baldes: 576 },
]

export function periodo(chave: ChavePeriodo): Periodo {
  return PERIODOS.find((p) => p.chave === chave) ?? PERIODOS[0]!
}

/** Passo esperado entre janelas normais e o fator da lacuna (iguais aos do painel). */
export const PASSO_NORMAL_S = 5
export const FATOR_LACUNA = 2.5

/** Um instante do gráfico. Valor nulo quebra a linha. */
export type Amostra = { t: number; valor: number | null; z: number | null }

export type Tendencia = {
  fonte: 'brutos' | 'agregado'
  passoS: number
  amostras: Amostra[]
  /** Quantas janelas entraram (no agregado, a soma dos intervalos). */
  janelas: number
}

/** O que a tendência lê de cada janela (formato da API; tipado aqui sem depender dela). */
export type JanelaDaTendencia = {
  medido_em: string
  modo: string
  pontos: Record<string, { rms_g: number; avaliacao?: { z: Record<string, number> } } | undefined>
}

/** O que a tendência lê da série agregada da API. */
export type SerieDaTendencia = {
  segundos_por_balde: number
  intervalos: {
    inicio: string
    fim: string
    janelas: number
    pontos: Record<string, { rms_media_g: number; z_max?: Record<string, number> } | undefined>
  }[]
}

const segundos = (instante: string) => Date.parse(instante) / 1000

/** Insere uma amostra vazia depois de cada janela que antecede um vão maior que o limite. */
export function quebrarNasLacunas(amostras: readonly Amostra[], passoS: number): Amostra[] {
  const limite = passoS * FATOR_LACUNA
  const saida: Amostra[] = []
  amostras.forEach((a, i) => {
    const anterior = amostras[i - 1]
    if (anterior && a.t - anterior.t > limite) saida.push({ t: anterior.t + passoS, valor: null, z: null })
    saida.push(a)
  })
  return saida
}

export function tendenciaDeJanelas(janelas: readonly JanelaDaTendencia[], codigo: string): Tendencia {
  const normais = janelas
    .filter((j) => j.modo === 'normal' && Number.isFinite(segundos(j.medido_em)))
    .map((j) => {
      const ponto = j.pontos[codigo]
      return {
        t: segundos(j.medido_em),
        valor: ponto?.rms_g ?? null,
        z: ponto?.avaliacao?.z.rms_g ?? null,
      }
    })
    .sort((a, b) => a.t - b.t)
  // a mesma janela em duas páginas (chegou uma nova entre as consultas) entra uma vez só
  const unicas = normais.filter((a, i) => i === 0 || a.t !== normais[i - 1]!.t)
  return {
    fonte: 'brutos',
    passoS: PASSO_NORMAL_S,
    amostras: quebrarNasLacunas(unicas, PASSO_NORMAL_S),
    janelas: unicas.length,
  }
}

export function tendenciaDeSerie(serie: SerieDaTendencia, codigo: string): Tendencia {
  let janelas = 0
  const amostras = serie.intervalos.map((intervalo) => {
    janelas += intervalo.janelas
    const ponto = intervalo.janelas > 0 ? intervalo.pontos[codigo] : undefined
    return {
      t: (segundos(intervalo.inicio) + segundos(intervalo.fim)) / 2,
      valor: ponto?.rms_media_g ?? null,
      z: ponto?.z_max?.rms_g ?? null,
    }
  })
  return { fonte: 'agregado', passoS: serie.segundos_por_balde, amostras, janelas }
}

/** Faixa normal e limites na unidade da medida, a partir do típico, do σ efetivo e dos z da API. */
export type FaixaNormal = { centro: number; inferior: number; atencao: number; alarme: number }

export function faixaNormal(
  medida: { tipico: number | null; sigma_efetivo?: number | null } | null | undefined,
  limites: { z_atencao: number; z_alarme: number } | null | undefined,
): FaixaNormal | null {
  const tipico = medida?.tipico
  const sigma = medida?.sigma_efetivo
  if (!limites || tipico === null || tipico === undefined || !sigma || !(sigma > 0)) return null
  // a mesma conta do z da API (z = (valor − típico) / σ efetivo), ao contrário
  return {
    centro: tipico,
    inferior: Math.max(0, tipico - limites.z_atencao * sigma),
    atencao: tipico + limites.z_atencao * sigma,
    alarme: tipico + limites.z_alarme * sigma,
  }
}

/** Eixo vertical de 0 a um teto "redondo" acima do maior valor (o mesmo degrau do painel). */
export function limitesDoEixo(valores: readonly (number | null | undefined)[]): [number, number] {
  let maximo = 0
  for (const v of valores) {
    if (v !== null && v !== undefined && Number.isFinite(v) && v > maximo) maximo = v
  }
  if (maximo <= 0) return [0, 1]
  const ordem = 10 ** Math.floor(Math.log10(maximo))
  const passos = [1, 2, 3, 4, 5, 6, 8, 10]
  const teto =
    passos.map((p) => Number((p * ordem).toPrecision(12))).find((p) => p >= maximo * 1.05) ?? maximo * 1.1
  return [0, teto]
}

const PASSOS_DE_TEMPO_S = [
  60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400,
]

/**
 * Marcas do eixo do tempo em horários redondos da hora local (04:00, 04:05...), no máximo `maxMarcas`.
 * `deslocamentoS` é o fuso em segundos (a leste positivo).
 */
export function marcasDeTempo(inicioS: number, fimS: number, maxMarcas: number, deslocamentoS = 0): number[] {
  if (!(fimS > inicioS) || maxMarcas < 1) return []
  for (const passoS of PASSOS_DE_TEMPO_S) {
    const primeira = Math.ceil((inicioS + deslocamentoS) / passoS) * passoS - deslocamentoS
    const marcas: number[] = []
    for (let t = primeira; t <= fimS + 1e-6; t += passoS) marcas.push(t)
    if (marcas.length <= maxMarcas) return marcas
  }
  return [inicioS, fimS]
}

/** A amostra com valor mais perto do instante (para o cursor); nulo se não há nenhuma. */
export function amostraMaisProxima(amostras: readonly Amostra[], t: number): number | null {
  let melhor: number | null = null
  let distancia = Infinity
  amostras.forEach((a, i) => {
    if (a.valor === null) return
    const d = Math.abs(a.t - t)
    if (d < distancia) {
      distancia = d
      melhor = i
    }
  })
  return melhor
}

/** Trechos contínuos de amostras com valor, para desenhar a linha sem ligar por cima dos buracos. */
export function trechos(amostras: readonly Amostra[]): Amostra[][] {
  const saida: Amostra[][] = []
  let atual: Amostra[] = []
  for (const a of amostras) {
    if (a.valor === null) {
      if (atual.length) saida.push(atual)
      atual = []
    } else {
      atual.push(a)
    }
  }
  if (atual.length) saida.push(atual)
  return saida
}

/** Resumo para o leitor de tela: faixa de valores, o último e quantos instantes em desvio. */
export function resumoDaTendencia(
  tendencia: Tendencia,
  limites: { z_atencao: number; z_alarme: number } | null | undefined,
  formatar: (valor: number) => string,
): string {
  const valores = tendencia.amostras.flatMap((a) => (a.valor === null ? [] : [a.valor]))
  if (valores.length === 0) return 'Sem janelas no período.'
  const ultimo = valores[valores.length - 1]!
  let atencao = 0
  let alarme = 0
  if (limites) {
    for (const a of tendencia.amostras) {
      if (a.z === null || a.valor === null) continue
      if (a.z >= limites.z_alarme) alarme++
      else if (a.z >= limites.z_atencao) atencao++
    }
  }
  const desvio =
    alarme + atencao === 0
      ? 'nenhum instante em desvio'
      : [alarme ? `${alarme} em alarme` : '', atencao ? `${atencao} em atenção` : ''].filter(Boolean).join(', ')
  return `RMS de ${formatar(Math.min(...valores))} a ${formatar(Math.max(...valores))}, último ${formatar(ultimo)}; ${desvio}.`
}

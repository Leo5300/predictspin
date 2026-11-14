/**
 * Mapa de ordens comparado com o típico. Cada célula (um intervalo de uma linha ponto × medida) é
 * comparada com a mediana da MESMA linha no período, considerando só os intervalos da mesma marcha
 * (rotação nominal mais próxima): trocar de marcha muda todas as linhas e isso não é problema.
 *
 * - Diferença menor que 15 % da mediana: célula "típica" (todas com o mesmo tom, faixa morta).
 * - Acima disso, a intensidade cresce de forma contínua até ±100 % (satura no extremo).
 * - Abaixo do típico é marcado à parte (pontilhado no desenho), para não competir com o "acima".
 * - Marcha com poucas células não tem típico confiável: a célula fica neutra.
 * - Intervalo incompleto (menos da metade das janelas habituais, típico na borda de uma lacuna) é a
 *   média de uma ou duas janelas: fica neutro e fora do cálculo do típico, para não virar ponto solto.
 * Nenhuma cor de alarme sai daqui: âmbar e vermelho só existem com a referência aprendida.
 */
import { marchaMaisProxima } from './tacometro'

/** Diferença relativa ao típico que ainda conta como "igual" (faixa morta). */
export const FAIXA_MORTA = 0.15
/** Diferença relativa em que a intensidade satura. */
export const DESVIO_MAXIMO = 1
/** Menos células que isto numa marcha: sem típico confiável. */
export const MINIMO_DE_CELULAS = 4
/** Abaixo desta rotação a máquina está parada: "marcha" 0. */
export const ROTACAO_PARADA_RPM = 20

/** Marcha de um intervalo: a rotação nominal mais próxima, 0 com a máquina parada, nulo sem rotação. */
export function marchaDoIntervalo(
  rotacaoRpm: number | null | undefined,
  nominais: readonly number[],
): number | null {
  if (rotacaoRpm === null || rotacaoRpm === undefined || !Number.isFinite(rotacaoRpm)) return null
  if (rotacaoRpm < ROTACAO_PARADA_RPM) return 0
  return marchaMaisProxima(rotacaoRpm, nominais) ?? Math.round(rotacaoRpm)
}

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  const centro = ordenados[meio] ?? 0
  return ordenados.length % 2 === 1 ? centro : ((ordenados[meio - 1] ?? centro) + centro) / 2
}

export type ClasseDaCelula =
  | { tipo: 'lacuna' }
  | {
      tipo: 'sem_tipico'
      valor: number
      marcha: number | null
      /** Intervalo com menos da metade das janelas habituais (borda de lacuna): média pouco firme. */
      incompleto: boolean
    }
  | {
      tipo: 'tipico' | 'acima' | 'abaixo'
      valor: number
      tipico: number
      /** Diferença relativa ao típico: 0,22 = 22 % acima; −0,3 = 30 % abaixo. */
      desvio: number
      /** 0 na borda da faixa morta, 1 a partir de ±100 %. */
      intensidade: number
      marcha: number | null
    }

/** Diferença relativa; típico zero só é "igual" a valor zero (e qualquer outro valor satura). */
export function desvioRelativo(valor: number, tipico: number): number {
  if (tipico > 0) return (valor - tipico) / tipico
  if (valor === tipico) return 0
  return valor > tipico ? DESVIO_MAXIMO : -DESVIO_MAXIMO
}

export function intensidadeDoDesvio(desvio: number): number {
  const fora = Math.abs(desvio) - FAIXA_MORTA
  if (fora <= 0) return 0
  return Math.min(1, fora / (DESVIO_MAXIMO - FAIXA_MORTA))
}

const chaveDaMarcha = (marcha: number | null) => (marcha === null ? 'sem' : String(marcha))

/** Intervalos com menos que esta fração da contagem habitual de janelas são incompletos. */
export const FRACAO_INTERVALO_COMPLETO = 0.5

/** Quais intervalos estão completos: contagem de janelas perto da habitual (mediana dos que têm). */
export function intervalosCompletos(
  janelas: readonly number[] | undefined,
  total: number,
): boolean[] {
  if (!janelas) return Array<boolean>(total).fill(true)
  const habitual = mediana(janelas.filter((j) => j > 0)) ?? 0
  return Array.from(
    { length: total },
    (_, k) => (janelas[k] ?? 0) >= FRACAO_INTERVALO_COMPLETO * habitual,
  )
}

/** Típico (mediana) de cada marcha de uma linha, só com os intervalos completos. */
export function tipicosPorMarcha(
  valores: readonly (number | null)[],
  marchas: readonly (number | null)[],
  completos?: readonly boolean[],
): Map<string, { tipico: number; celulas: number }> {
  const grupos = new Map<string, number[]>()
  valores.forEach((valor, k) => {
    if (valor === null || !Number.isFinite(valor)) return
    if (completos?.[k] === false) return
    const chave = chaveDaMarcha(marchas[k] ?? null)
    const grupo = grupos.get(chave)
    if (grupo) grupo.push(valor)
    else grupos.set(chave, [valor])
  })
  const saida = new Map<string, { tipico: number; celulas: number }>()
  for (const [chave, grupo] of grupos) {
    saida.set(chave, { tipico: mediana(grupo) ?? 0, celulas: grupo.length })
  }
  return saida
}

/** Classe de cada célula de uma linha. `janelas` (por intervalo) marca os intervalos incompletos. */
export function classificarLinha(
  valores: readonly (number | null)[],
  marchas: readonly (number | null)[],
  janelas?: readonly number[],
): ClasseDaCelula[] {
  const completos = intervalosCompletos(janelas, valores.length)
  const tipicos = tipicosPorMarcha(valores, marchas, completos)
  return valores.map((valor, k): ClasseDaCelula => {
    if (valor === null || !Number.isFinite(valor)) return { tipo: 'lacuna' }
    const marcha = marchas[k] ?? null
    if (completos[k] === false) return { tipo: 'sem_tipico', valor, marcha, incompleto: true }
    const grupo = tipicos.get(chaveDaMarcha(marcha))
    if (!grupo || grupo.celulas < MINIMO_DE_CELULAS)
      return { tipo: 'sem_tipico', valor, marcha, incompleto: false }
    const desvio = desvioRelativo(valor, grupo.tipico)
    const tipo = Math.abs(desvio) < FAIXA_MORTA ? 'tipico' : desvio > 0 ? 'acima' : 'abaixo'
    return {
      tipo,
      valor,
      tipico: grupo.tipico,
      desvio,
      intensidade: intensidadeDoDesvio(desvio),
      marcha,
    }
  })
}

export type Destaque = {
  ponto: string
  grandeza: string
  direcao: 'acima' | 'abaixo'
  /** Diferença média no trecho (relativa; 0,22 = 22 %). */
  desvio: number
  /** Índices do primeiro e do último intervalo do trecho. */
  inicio: number
  fim: number
  /** O trecho chega ao último intervalo com dado da linha: ainda está acontecendo. */
  emCurso: boolean
  marcha: number | null
  /** Outras linhas do mesmo ponto que também fugiram do típico no período. */
  outras: number
}

/** Trechos com menos intervalos seguidos que isto não viram destaque (um ponto solto não é tendência). */
export const MINIMO_DO_TRECHO = 2

/**
 * O que a leitura em texto diz: para cada linha, o trecho seguido (sem lacuna) mais forte fora da
 * faixa morta, na mesma direção. Uma frase por PONTO (a medida mais forte dele, com quantas outras
 * linhas do ponto também fugiram), os maiores desvios primeiro, no máximo `limite`: de relance, qual
 * ponto, qual medida e desde quando. Lista vazia = tudo dentro de ±15 % do típico.
 */
export function destaquesDoMapa(
  linhas: readonly { ponto: string; grandeza: string; classes: readonly ClasseDaCelula[] }[],
  limite = 3,
): Destaque[] {
  const destaques: Destaque[] = []
  for (const linha of linhas) {
    const ultimoComDado = linha.classes.findLastIndex((c) => c.tipo !== 'lacuna')
    let melhor: Destaque | null = null
    let k = 0
    while (k < linha.classes.length) {
      const c = linha.classes[k]
      if (!c || (c.tipo !== 'acima' && c.tipo !== 'abaixo')) {
        k++
        continue
      }
      const direcao = c.tipo
      const inicio = k
      let soma = 0
      const marchas = new Map<number | null, number>()
      while (k < linha.classes.length) {
        const atual = linha.classes[k]
        if (atual?.tipo !== direcao) break
        soma += atual.desvio
        marchas.set(atual.marcha, (marchas.get(atual.marcha) ?? 0) + 1)
        k++
      }
      const tamanho = k - inicio
      if (tamanho < MINIMO_DO_TRECHO) continue
      const desvio = soma / tamanho
      if (!melhor || Math.abs(desvio) > Math.abs(melhor.desvio)) {
        const marcha = [...marchas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        melhor = {
          ponto: linha.ponto,
          grandeza: linha.grandeza,
          direcao,
          desvio,
          inicio,
          fim: k - 1,
          emCurso: k - 1 === ultimoComDado,
          marcha,
          outras: 0,
        }
      }
    }
    if (melhor) destaques.push(melhor)
  }
  const porPonto = new Map<string, Destaque>()
  for (const d of destaques.sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))) {
    const atual = porPonto.get(d.ponto)
    if (atual) atual.outras += 1
    else porPonto.set(d.ponto, d)
  }
  return [...porPonto.values()].slice(0, limite)
}

export const TEXTO_NORMAL = `Normal: todas as linhas dentro de ±${Math.round(FAIXA_MORTA * 100)}% do típico`

/** "B·RMS 22% acima do típico desde 17:02 (marcha 1120)". */
export function textoDoDestaque(d: Destaque, horaDoInicio: string, horaDoFim: string): string {
  const percentual = Math.round(Math.abs(d.desvio) * 100)
  const quando = d.emCurso ? `desde ${horaDoInicio}` : `entre ${horaDoInicio} e ${horaDoFim}`
  const marcha =
    d.marcha === null ? '' : d.marcha === 0 ? ' (máquina parada)' : ` (marcha ${d.marcha})`
  const outras =
    d.outras === 0 ? '' : `; mais ${d.outras} ${d.outras === 1 ? 'linha' : 'linhas'} do ${d.ponto}`
  return `${d.ponto}·${d.grandeza} ${percentual}% ${d.direcao} do típico ${quando}${marcha}${outras}`
}

/** Trocas de marcha ao longo do período: índice do intervalo e a marcha nova. */
export function trocasDeMarcha(
  marchas: readonly (number | null)[],
): { indice: number; marcha: number }[] {
  const trocas: { indice: number; marcha: number }[] = []
  let atual: number | null = null
  marchas.forEach((marcha, indice) => {
    if (marcha === null) return
    if (marcha !== atual) trocas.push({ indice, marcha })
    atual = marcha
  })
  return trocas
}

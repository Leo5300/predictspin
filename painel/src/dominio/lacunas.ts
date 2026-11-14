/**
 * Lacunas: trechos sem janela. Nos gráficos a linha é interrompida, nunca ligada por cima.
 */

/** Passo esperado entre janelas de cada modo, em segundos. */
export const PASSO_NORMAL_S = 5
export const PASSO_RAPIDO_S = 1

/** Há lacuna quando o espaço entre duas janelas passa de 2,5 vezes o passo esperado. */
export const FATOR_LACUNA = 2.5

export function limiteDeLacunaS(passoS: number): number {
  return passoS * FATOR_LACUNA
}

export type Lacuna = { inicioS: number; fimS: number }

/** Intervalos entre amostras consecutivas (tempos em segundos, crescentes) maiores que o limite. */
export function detectarLacunas(temposS: readonly number[], limiteS: number): Lacuna[] {
  const lacunas: Lacuna[] = []
  for (let i = 1; i < temposS.length; i++) {
    const anterior = temposS[i - 1]
    const atual = temposS[i]
    if (anterior !== undefined && atual !== undefined && atual - anterior > limiteS) {
      lacunas.push({ inicioS: anterior, fimS: atual })
    }
  }
  return lacunas
}

/**
 * Insere uma amostra vazia logo depois de cada janela que antecede uma lacuna, para o gráfico
 * quebrar a linha ali. Devolve os tempos e, para cada série, os valores alinhados (nulo na quebra).
 */
export function quebrarNasLacunas(
  temposS: readonly number[],
  series: readonly (readonly (number | null)[])[],
  limiteS: number,
): { temposS: number[]; series: (number | null)[][] } {
  const tempos: number[] = []
  const saida: (number | null)[][] = series.map(() => [])
  for (let i = 0; i < temposS.length; i++) {
    const t = temposS[i]
    if (t === undefined) continue
    const anterior = i > 0 ? temposS[i - 1] : undefined
    if (anterior !== undefined && t - anterior > limiteS) {
      tempos.push(anterior + limiteS / FATOR_LACUNA)
      saida.forEach((s) => s.push(null))
    }
    tempos.push(t)
    series.forEach((valores, k) => saida[k]?.push(valores[i] ?? null))
  }
  return { temposS: tempos, series: saida }
}

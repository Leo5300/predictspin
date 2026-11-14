/**
 * Escala do tacômetro: as rotações nominais do torno (a placa de rotações do cabeçote) em escala
 * logarítmica, porque vão de 45 a 2240 rpm (um fator de 50) e as marchas baixas ficariam espremidas
 * numa escala linear.
 */

/** Fração de 0 a 1 da rotação na escala logarítmica entre o mínimo e o máximo. Fora da faixa, presa. */
export function fracaoLog(rpm: number, minimo: number, maximo: number): number {
  if (!Number.isFinite(rpm) || rpm <= 0 || minimo <= 0 || maximo <= minimo) return 0
  const t = (Math.log(rpm) - Math.log(minimo)) / (Math.log(maximo) - Math.log(minimo))
  return Math.min(1, Math.max(0, t))
}

/**
 * Limites da escala: um pouco além da menor e da maior rotação nominal, para as marcas das pontas
 * não ficarem coladas no fim do arco.
 */
export function limitesDaEscala(nominais: readonly number[]): [number, number] {
  const validas = nominais.filter((r) => Number.isFinite(r) && r > 0)
  if (validas.length === 0) return [10, 3000]
  return [Math.min(...validas) * 0.85, Math.max(...validas) * 1.15]
}

/**
 * A marcha (rotação nominal) mais próxima da medida, por distância relativa (logarítmica): 1180 rpm
 * está mais perto de 1120 que de 1400. Nula sem rotação ou sem lista de nominais.
 */
export function marchaMaisProxima(
  rpm: number | null | undefined,
  nominais: readonly number[],
): number | null {
  if (rpm === null || rpm === undefined || !Number.isFinite(rpm) || rpm <= 0) return null
  let melhor: number | null = null
  let menor = Number.POSITIVE_INFINITY
  for (const nominal of nominais) {
    if (!(nominal > 0)) continue
    const distancia = Math.abs(Math.log(rpm / nominal))
    if (distancia < menor) {
      menor = distancia
      melhor = nominal
    }
  }
  return melhor
}

/** Rotação inteira, sem separador de milhar (para a fonte de matriz de pontos): 1180, não 1.180. */
export function rpmSemMilhar(rpm: number | null | undefined): string {
  if (rpm === null || rpm === undefined || !Number.isFinite(rpm)) return '—'
  return String(Math.round(rpm))
}

/**
 * Marcas do tacômetro com a posição de cada rótulo: o rótulo que cairia a menos de `afastamento`
 * graus do anterior vai para a fileira de dentro (265 e 280 rpm ficam a 1,5° um do outro).
 */
export function marcasDoTacometro(
  nominais: readonly number[],
  minimo: number,
  maximo: number,
  aberturaGraus: number,
  afastamentoGraus: number,
): { nominal: number; fracao: number; dentro: boolean }[] {
  const ordenadas = [...nominais].filter((r) => r > 0).sort((a, b) => a - b)
  const saida: { nominal: number; fracao: number; dentro: boolean }[] = []
  let ultimoRotulo = Number.NEGATIVE_INFINITY
  for (const nominal of ordenadas) {
    const fracao = fracaoLog(nominal, minimo, maximo)
    const graus = fracao * aberturaGraus
    const dentro = graus - ultimoRotulo < afastamentoGraus
    if (!dentro) ultimoRotulo = graus
    saida.push({ nominal, fracao, dentro })
  }
  return saida
}

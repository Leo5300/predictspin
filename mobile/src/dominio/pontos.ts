/**
 * Pontos de medição e grandezas. No torno: A = acionamento (cabeçote), B = ferramenta–peça (carro),
 * C = estrutura (ponta do barramento). Cada ponto tem um tom neutro e um estilo de linha próprio
 * (A contínua, B tracejada, C pontilhada), sempre com a letra; nenhum usa cor de estado.
 */

export type EstiloDeLinha = 'continua' | 'tracejada' | 'pontilhada'

const ESTILO: Record<string, EstiloDeLinha> = { A: 'continua', B: 'tracejada', C: 'pontilhada' }

export function estiloDoPonto(codigo: string): EstiloDeLinha {
  return ESTILO[codigo] ?? 'continua'
}

/** Traço do SVG para cada estilo (strokeDasharray); contínua não tem traço. */
export const TRACO_DO_ESTILO: Record<EstiloDeLinha, string | undefined> = {
  continua: undefined,
  tracejada: '6 4',
  pontilhada: '1.5 3',
}

/** Nome do token de cor do ponto (pontoA, pontoB, pontoC); outros pontos ficam com o tom do C. */
export function corDoPonto(codigo: string): 'pontoA' | 'pontoB' | 'pontoC' {
  if (codigo === 'A') return 'pontoA'
  if (codigo === 'B') return 'pontoB'
  return 'pontoC'
}

const ROTULO_PAPEL: Record<string, string> = {
  acionamento: 'acionamento',
  ferramenta: 'ferramenta–peça',
  estrutura: 'estrutura',
}

export function rotuloDoPapel(papel: string | null | undefined): string {
  if (!papel) return ''
  return ROTULO_PAPEL[papel] ?? papel
}

/** Ordena códigos de ponto de forma estável (A, B, C, depois os demais em ordem alfabética). */
export function ordenarCodigos(codigos: Iterable<string>): string[] {
  return [...codigos].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export type ChaveGrandeza = 'rms_g' | 'pico_g' | 'curtose' | 'o1x' | 'o2x' | 'o3x' | 'vel_rms_mm_s'

/** Grandezas de um ponto numa janela, na ordem do detalhe do ponto. */
export const GRANDEZAS: readonly { chave: ChaveGrandeza; rotulo: string; unidade: string; casas: number }[] =
  [
    { chave: 'rms_g', rotulo: 'RMS', unidade: 'g', casas: 3 },
    { chave: 'pico_g', rotulo: 'PICO', unidade: 'g', casas: 3 },
    { chave: 'curtose', rotulo: 'CURT', unidade: '', casas: 2 },
    { chave: 'o1x', rotulo: '1X', unidade: 'g', casas: 3 },
    { chave: 'o2x', rotulo: '2X', unidade: 'g', casas: 3 },
    { chave: 'o3x', rotulo: '3X', unidade: 'g', casas: 3 },
    { chave: 'vel_rms_mm_s', rotulo: 'VEL', unidade: 'mm/s', casas: 2 },
  ]

/** Marcha = rotação nominal da placa mais próxima da medida; nulo sem rotações ou sem medida. */
export function marchaMaisProxima(
  rotacaoRpm: number | null | undefined,
  nominais: readonly number[],
): number | null {
  if (rotacaoRpm === null || rotacaoRpm === undefined || !Number.isFinite(rotacaoRpm)) return null
  if (rotacaoRpm <= 0) return 0
  let melhor: number | null = null
  for (const n of nominais) {
    if (melhor === null || Math.abs(n - rotacaoRpm) < Math.abs(melhor - rotacaoRpm)) melhor = n
  }
  return melhor
}

// ------------------------------------------------------------------ sparkline

/**
 * Caminhos SVG de uma sparkline sem eixos. Valor nulo é lacuna (intervalo sem janela) e quebra a
 * linha: linha interrompida quer dizer que não chegou dado. Um ponto isolado vira um traço curto.
 */
export function caminhosDaSparkline(
  valores: readonly (number | null)[],
  largura: number,
  altura: number,
  margem = 2,
): string[] {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (validos.length === 0 || valores.length === 0) return []
  const min = Math.min(...validos)
  const max = Math.max(...validos)
  const passo = valores.length > 1 ? (largura - 2 * margem) / (valores.length - 1) : 0
  const y = (v: number) =>
    max === min ? altura / 2 : margem + (1 - (v - min) / (max - min)) * (altura - 2 * margem)
  const caminhos: string[] = []
  let atual: string[] = []
  const fechar = () => {
    if (atual.length === 1) {
      // ponto isolado: um traço curto para aparecer
      const [, xs, ys] = /M([\d.]+) ([\d.]+)/.exec(atual[0] ?? '') ?? []
      atual.push(`L${(Number(xs) + 1.5).toFixed(1)} ${ys}`)
    }
    if (atual.length > 0) caminhos.push(atual.join(' '))
    atual = []
  }
  valores.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      fechar()
      return
    }
    const comando = atual.length === 0 ? 'M' : 'L'
    atual.push(`${comando}${(margem + i * passo).toFixed(1)} ${y(v).toFixed(1)}`)
  })
  fechar()
  return caminhos
}

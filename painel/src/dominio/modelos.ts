/**
 * Textos e contas da segunda opinião (modelos). Nenhum número de medição ou limite é escrito aqui: escore,
 * confiança, limiar e métricas vêm da API.
 */

export const NOMES_DAS_CLASSES: Record<string, string> = {
  normal: 'normal',
  avanco_excessivo: 'avanço excessivo',
  rotacao_inadequada: 'rotação inadequada',
  ferramenta_desgastada: 'ferramenta desgastada',
  desbalanceamento: 'desbalanceamento',
  outra: 'outra',
}

/** Classes que o técnico pode escolher ao concluir a OS (as 5 do classificador e "outra"). */
export const CONDICOES_ENCONTRADAS = [
  'normal',
  'avanco_excessivo',
  'rotacao_inadequada',
  'ferramenta_desgastada',
  'desbalanceamento',
  'outra',
] as const

export type CondicaoEncontrada = (typeof CONDICOES_ENCONTRADAS)[number]

export function nomeDaClasse(classe: string | null | undefined): string {
  if (!classe) return '—'
  return NOMES_DAS_CLASSES[classe] ?? classe.replaceAll('_', ' ')
}

const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
const PCT1 = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const NUM2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function porcento(valor: number | null | undefined, casas: 0 | 1 = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return (casas === 1 ? PCT1 : PCT).format(valor)
}

export function decimal2(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return NUM2.format(valor)
}

/** "avanço excessivo, 78%" ou "classe incerta (mais parecida: avanço excessivo, 45%)" ou só a anomalia. */
export function resumoDaOpiniao(o: {
  classe?: string | null
  confianca?: number | null
  incerta: boolean
  anomalia: boolean
}): string {
  if (!o.classe) return o.anomalia ? 'o modelo vê anomalia' : 'o modelo não vê anomalia'
  if (o.incerta)
    return `classe incerta (mais parecida: ${nomeDaClasse(o.classe)}, ${porcento(o.confianca)})`
  return `${nomeDaClasse(o.classe)}, ${porcento(o.confianca)}`
}

/** Intensidade (0 a 1) de cada célula da matriz de confusão, pela linha (classe real): um tom só. */
export function intensidades(matriz: number[][]): number[][] {
  return matriz.map((linha) => {
    const total = linha.reduce((a, b) => a + b, 0)
    return linha.map((v) => (total === 0 ? 0 : v / total))
  })
}

export const ROTULO_ESTADO_TRABALHO: Record<string, string> = {
  pendente: 'esperando o comando no notebook',
  acordando: 'acordando o serviço de treino',
  executando: 'treinando',
  concluido: 'concluído',
  falhou: 'falhou',
}

export function emAndamento(estado: string): boolean {
  return estado === 'pendente' || estado === 'acordando' || estado === 'executando'
}

/** "z_B_rms_g" → "B·RMS"; o resto fica legível sem sublinhados. */
export function nomeDaCaracteristica(nome: string): string {
  const m = /^z_([A-Z])_(.+)$/.exec(nome)
  if (m) {
    const medida: Record<string, string> = {
      rms_g: 'RMS',
      pico_g: 'pico',
      curtose: 'curtose',
      o1x: '1X',
      o2x: '2X',
      o3x: '3X',
      vel_rms_mm_s: 'velocidade',
    }
    return `${m[1]}·${medida[m[2] ?? ''] ?? m[2]}`
  }
  const fixos: Record<string, string> = {
    log_rms_b_a: 'RMS B ÷ A (log)',
    log_rms_c_a: 'RMS C ÷ A (log)',
    marcha_rpm: 'marcha',
    etapa_t3: 'corte (T3)',
  }
  if (fixos[nome]) return fixos[nome]
  return nome.replace(/^canal_/, 'canal ').replaceAll('_', ' ')
}

/** Nome curto da medida dominante de um alerta (a API manda o código: rms_g, o1x...). */
export const ROTULO_MEDIDA: Record<string, string> = {
  rms_g: 'RMS',
  pico_g: 'pico',
  curtose: 'curtose',
  o1x: '1X',
  o2x: '2X',
  o3x: '3X',
  vel_rms_mm_s: 'velocidade',
  instrumento: 'sensor',
}

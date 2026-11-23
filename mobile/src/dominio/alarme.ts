/**
 * Alarmes no padrão ISA-18.2, como o app mostra. O estado, a prioridade, o nível, o motivo e a ação
 * recomendada vêm da API; aqui só ficam rótulos, a aparência (texto + forma + tom), a ordem da lista
 * e quais ações cabem em cada estado. O app nunca cria, apaga ou muda a prioridade de um alarme.
 */
import type { Forma, Tom } from './estado'

export type EstadoAlarme =
  | 'ativo_nao_reconhecido'
  | 'ativo_reconhecido'
  | 'normalizado_nao_reconhecido'
  | 'encerrado'
  | 'suprimido'

/** O mínimo de um alarme que estas regras usam (campos do AlertaResposta da API). */
export type AlarmeBasico = {
  id: number
  estado: EstadoAlarme
  nivel: 'normal' | 'atencao' | 'alarme'
  prioridade: 'baixa' | 'alta'
  tipo: 'maquina' | 'instrumento'
  criado_em: string
}

export const ROTULO_ESTADO_ALARME: Record<EstadoAlarme, string> = {
  ativo_nao_reconhecido: 'ativo, não reconhecido',
  ativo_reconhecido: 'ativo, reconhecido',
  normalizado_nao_reconhecido: 'voltou ao normal, não reconhecido',
  encerrado: 'encerrado',
  suprimido: 'suprimido',
}

export const ROTULO_ACAO_HISTORICO: Record<string, string> = {
  abriu: 'abriu',
  piorou: 'piorou',
  melhorou: 'melhorou',
  normalizou: 'voltou ao normal',
  reconhecido: 'reconhecido',
  suprimido: 'suprimido',
  supressao_encerrada: 'supressão encerrada',
  encerrado: 'encerrado',
}

export const ROTULO_NIVEL: Record<'normal' | 'atencao' | 'alarme', string> = {
  normal: 'NORMAL',
  atencao: 'ATENÇÃO',
  alarme: 'ALARME',
}

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

export function rotuloDaMedida(medida: string): string {
  return ROTULO_MEDIDA[medida] ?? medida.replaceAll('_', ' ')
}

/** Em aberto: precisa de alguém (ativo, voltou sem reconhecimento ou silenciado por prazo). */
export const EM_ABERTO: ReadonlySet<EstadoAlarme> = new Set([
  'ativo_nao_reconhecido',
  'ativo_reconhecido',
  'normalizado_nao_reconhecido',
  'suprimido',
])

export function emAberto(alarme: Pick<AlarmeBasico, 'estado'>): boolean {
  return EM_ABERTO.has(alarme.estado)
}

/** Reconhecer ("eu vi") cabe no ativo não reconhecido e no que voltou ao normal sem reconhecimento. */
export function reconhecivel(alarme: Pick<AlarmeBasico, 'estado'>): boolean {
  return alarme.estado === 'ativo_nao_reconhecido' || alarme.estado === 'normalizado_nao_reconhecido'
}

export function suprimivel(alarme: Pick<AlarmeBasico, 'estado'>): boolean {
  return alarme.estado === 'ativo_nao_reconhecido' || alarme.estado === 'ativo_reconhecido'
}

export function supressaoCancelavel(alarme: Pick<AlarmeBasico, 'estado'>): boolean {
  return alarme.estado === 'suprimido'
}

export type AparenciaDoAlarme = {
  /** ALARME, ATENÇÃO ou INSTRUMENTO. */
  rotulo: string
  forma: Forma
  tom: Tom
  /** Contorno sem preenchimento: voltou ao normal ou encerrado. */
  vazado: boolean
  /** Traço diagonal sobre a forma: suprimido. */
  riscado: boolean
  /** Ativo não reconhecido: só o ícone pisca devagar (anel parado com "reduzir movimento"). */
  pisca: boolean
}

/**
 * Forma: losango = alarme, triângulo = atenção, quadrado = instrumento. Cor só no que está em desvio
 * agora: voltou ao normal, encerrado e suprimido ficam em cinza.
 */
export function aparenciaDoAlarme(alarme: Pick<AlarmeBasico, 'estado' | 'nivel' | 'tipo'>): AparenciaDoAlarme {
  const instrumento = alarme.tipo === 'instrumento'
  const apagado =
    alarme.estado === 'suprimido' ||
    alarme.estado === 'encerrado' ||
    alarme.estado === 'normalizado_nao_reconhecido'
  const rotulo = instrumento ? 'INSTRUMENTO' : alarme.nivel === 'alarme' ? 'ALARME' : 'ATENÇÃO'
  const forma: Forma = instrumento ? 'quadrado' : alarme.nivel === 'alarme' ? 'losango' : 'triangulo'
  const tom: Tom = apagado
    ? 'apagado'
    : instrumento
      ? 'info'
      : alarme.nivel === 'alarme'
        ? 'alarme'
        : 'atencao'
  return {
    rotulo,
    forma,
    tom,
    vazado: alarme.estado === 'normalizado_nao_reconhecido' || alarme.estado === 'encerrado',
    riscado: alarme.estado === 'suprimido',
    pisca: alarme.estado === 'ativo_nao_reconhecido',
  }
}

const ORDEM_DO_ESTADO: Record<EstadoAlarme, number> = {
  ativo_nao_reconhecido: 0,
  normalizado_nao_reconhecido: 1,
  ativo_reconhecido: 2,
  suprimido: 3,
  encerrado: 4,
}

/**
 * Ordem da lista: em aberto antes de encerrado; depois prioridade alta antes de baixa; depois o que
 * ainda não foi reconhecido; por fim o mais novo primeiro.
 */
export function ordenarAlarmes<T extends AlarmeBasico>(alarmes: readonly T[]): T[] {
  return [...alarmes].sort((a, b) => {
    const aberto = Number(!emAberto(a)) - Number(!emAberto(b))
    if (aberto !== 0) return aberto
    const prioridade = Number(a.prioridade !== 'alta') - Number(b.prioridade !== 'alta')
    if (prioridade !== 0) return prioridade
    const estado = ORDEM_DO_ESTADO[a.estado] - ORDEM_DO_ESTADO[b.estado]
    if (estado !== 0) return estado
    return Date.parse(b.criado_em) - Date.parse(a.criado_em) || b.id - a.id
  })
}

export type FiltroAlarmes = 'ativos' | 'todos'

export function filtrarAlarmes<T extends AlarmeBasico>(alarmes: readonly T[], filtro: FiltroAlarmes): T[] {
  return ordenarAlarmes(filtro === 'todos' ? alarmes : alarmes.filter(emAberto))
}

/** Alerta de instrumento em aberto por ponto (o mais novo), para o estado do ponto na tela da máquina. */
export function instrumentoPorPonto<T extends AlarmeBasico & { ponto: string; acao_recomendada: string }>(
  alarmes: readonly T[],
): Map<string, T> {
  const saida = new Map<string, T>()
  for (const a of ordenarAlarmes(alarmes)) {
    if (a.tipo !== 'instrumento' || a.estado === 'encerrado' || a.estado === 'suprimido') continue
    if (a.estado === 'normalizado_nao_reconhecido') continue
    if (!saida.has(a.ponto)) saida.set(a.ponto, a)
  }
  return saida
}

// ------------------------------------------------------------------ segunda opinião do modelo

export const NOMES_DAS_CLASSES: Record<string, string> = {
  normal: 'normal',
  avanco_excessivo: 'avanço excessivo',
  rotacao_inadequada: 'rotação inadequada',
  ferramenta_desgastada: 'ferramenta desgastada',
  desbalanceamento: 'desbalanceamento',
  outra: 'outra',
}

export function nomeDaClasse(classe: string | null | undefined): string {
  if (!classe) return '—'
  return NOMES_DAS_CLASSES[classe] ?? classe.replaceAll('_', ' ')
}

/** "avanço excessivo, 78 %", "classe incerta (mais parecida: ...)" ou só se o modelo vê anomalia. */
export function resumoDaOpiniao(
  o: { classe?: string | null; confianca?: number | null; incerta: boolean; anomalia: boolean },
  formatarPercentual: (v: number | null | undefined) => string,
): string {
  if (!o.classe) return o.anomalia ? 'o modelo vê anomalia' : 'o modelo não vê anomalia'
  if (o.incerta)
    return `classe incerta (mais parecida: ${nomeDaClasse(o.classe)}, ${formatarPercentual(o.confianca)})`
  return `${nomeDaClasse(o.classe)}, ${formatarPercentual(o.confianca)}`
}

/** Novo alarme chegou pelo SSE: só "abriu" avisa (piorou, reconheceu etc. só atualizam a lista). */
export function ehAlarmeNovo(acao: string): boolean {
  return acao === 'abriu'
}

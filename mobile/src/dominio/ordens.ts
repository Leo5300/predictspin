/**
 * Ordens de serviço no app: ordem da lista, filtros, rótulos e o formulário de conclusão. Os valores que
 * a API aceita na conclusão vêm do contrato (src/api/enumeracoes.ts, gerado); aqui só ficam os nomes
 * em português para mostrar.
 */

export type StatusOrdem = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada'

export type FiltroOrdens = 'todas' | 'aberta' | 'em_andamento' | 'concluida'

export const FILTROS_DE_ORDENS: { valor: FiltroOrdens; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'aberta', rotulo: 'Abertas' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'concluida', rotulo: 'Concluídas' },
]

export const ROTULO_STATUS_ORDEM: Record<StatusOrdem, string> = {
  aberta: 'ABERTA',
  em_andamento: 'EM ANDAMENTO',
  concluida: 'CONCLUÍDA',
  cancelada: 'CANCELADA',
}

const ORDEM_DO_STATUS: Record<StatusOrdem, number> = { aberta: 0, em_andamento: 1, concluida: 2, cancelada: 3 }

type OrdemParaLista = { status: StatusOrdem; aberta_em: string; responsavel: string | null }

/** Abertas primeiro (as não assumidas no topo), depois em andamento, concluídas e canceladas; mais nova antes. */
export function ordenarOrdens<T extends OrdemParaLista>(ordens: readonly T[]): T[] {
  return [...ordens].sort((a, b) => {
    const porStatus = ORDEM_DO_STATUS[a.status] - ORDEM_DO_STATUS[b.status]
    if (porStatus !== 0) return porStatus
    const semDono = Number(a.responsavel !== null) - Number(b.responsavel !== null)
    if (semDono !== 0) return semDono
    return Date.parse(b.aberta_em) - Date.parse(a.aberta_em)
  })
}

/** Aberta e ninguém assumiu: a linha fica em destaque. */
export function emDestaque(ordem: { status: StatusOrdem; responsavel: string | null }): boolean {
  return ordem.status === 'aberta' && ordem.responsavel === null
}

export function podeAssumir(ordem: { status: StatusOrdem }): boolean {
  return ordem.status === 'aberta'
}

export function podeConcluir(ordem: { status: StatusOrdem }): boolean {
  return ordem.status === 'aberta' || ordem.status === 'em_andamento'
}

const NOMES: Record<string, string> = {
  normal: 'Normal (nada de errado)',
  avanco_excessivo: 'Avanço excessivo',
  rotacao_inadequada: 'Rotação inadequada',
  ferramenta_desgastada: 'Ferramenta desgastada',
  desbalanceamento: 'Desbalanceamento',
  outra: 'Outra',
  confirmada: 'Havia problema',
  rejeitada: 'Alarme falso',
}

/** Nome para mostrar; um valor novo do contrato aparece com os sublinhados trocados por espaço. */
export function nomeDoValor(valor: string | null | undefined): string {
  if (!valor) return '—'
  return NOMES[valor] ?? valor.replaceAll('_', ' ')
}

/** Abre a OS em volta da abertura: 15 min antes até 15 min depois (ou agora, se ainda não passou). */
export function janelaEmVoltaDaAbertura(abertaEm: string, agoraMs: number): { inicioS: number; fimS: number } {
  const abertura = Date.parse(abertaEm) / 1000
  return { inicioS: abertura - 15 * 60, fimS: Math.min(abertura + 15 * 60, agoraMs / 1000) }
}

export type FormularioDeConclusao = { retorno: string | null; condicao: string | null; comentario: string }

/** O que falta para concluir: a API exige o retorno; condição e observação são opcionais. */
export function faltaNaConclusao(form: FormularioDeConclusao): string | null {
  return form.retorno ? null : 'Diga se havia problema ou se o alarme era falso.'
}

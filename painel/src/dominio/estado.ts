import type { Frescor } from './idade'

/**
 * Estado da máquina na visão geral: OPERANDO = dado vivo e rotação acima de zero; PARADO = dado
 * vivo e rotação zero; SEM DADOS = dado velho ou nenhum.
 */
export type EstadoMaquina = 'operando' | 'parado' | 'sem_dados'

export const ROTULO_ESTADO: Record<EstadoMaquina, string> = {
  operando: 'OPERANDO',
  parado: 'PARADO',
  sem_dados: 'SEM DADOS',
}

export function estadoDaMaquina(
  frescor: Frescor,
  rotacaoRpm: number | null | undefined,
): EstadoMaquina {
  if (frescor !== 'vivo' || rotacaoRpm === null || rotacaoRpm === undefined) return 'sem_dados'
  return rotacaoRpm > 0 ? 'operando' : 'parado'
}

/**
 * Faixa normal aprendida para um ponto e uma rotação. Ainda não existe na API: quando existir,
 * chega por parâmetro aos componentes. O painel nunca calcula referência.
 */
export type Referencia = {
  /** Valor típico (centro da régua). */
  centro: number
  /** Meia largura da faixa de tolerância em torno do centro. */
  tolerancia: number
  /** A partir daqui a avaliação é ATENÇÃO. */
  atencao: number
  /** A partir daqui a avaliação é ALARME. */
  alarme: number
}

export type Avaliacao = 'sem_referencia' | 'normal' | 'atencao' | 'alarme'

export const ROTULO_AVALIACAO: Record<Avaliacao, string> = {
  sem_referencia: 'SEM REFERÊNCIA',
  normal: 'NORMAL',
  atencao: 'ATENÇÃO',
  alarme: 'ALARME',
}

export function avaliar(
  valor: number | null | undefined,
  referencia: Referencia | null | undefined,
): Avaliacao {
  if (!referencia || valor === null || valor === undefined || !Number.isFinite(valor))
    return 'sem_referencia'
  if (valor >= referencia.alarme) return 'alarme'
  if (valor >= referencia.atencao) return 'atencao'
  return 'normal'
}

/** A pior avaliação de um conjunto (para resumir uma máquina a partir dos pontos). */
export function piorAvaliacao(avaliacoes: Avaliacao[]): Avaliacao {
  const ordem: Avaliacao[] = ['alarme', 'atencao', 'normal', 'sem_referencia']
  return ordem.find((a) => avaliacoes.includes(a)) ?? 'sem_referencia'
}

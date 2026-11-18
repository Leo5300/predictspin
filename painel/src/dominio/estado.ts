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

/** Como a API avaliou um ponto numa janela (o código é o da API). */
export type Situacao =
  | 'avaliada'
  | 'sem_referencia'
  | 'sem_referencia_completa'
  | 'calibracao_diferente'
  | 'nao_avaliavel'

/** Texto do selo de cada situação que não é "avaliada" (o estado então não existe). */
export const ROTULO_SITUACAO: Record<Exclude<Situacao, 'avaliada'>, string> = {
  sem_referencia: 'SEM REFERÊNCIA',
  sem_referencia_completa: 'SEM REFERÊNCIA COMPLETA',
  calibracao_diferente: 'CALIBRAÇÃO DIFERENTE',
  nao_avaliavel: 'NÃO AVALIÁVEL',
}

/** Avaliação do ponto a partir do que a API mandou (situação e estado); sem avaliação = sem referência. */
export function avaliacaoDoPonto(
  avaliacao: { situacao: string; estado?: string | null } | null | undefined,
): Avaliacao {
  if (avaliacao?.situacao !== 'avaliada' || !avaliacao.estado) return 'sem_referencia'
  const estado = avaliacao.estado
  return estado === 'alarme' || estado === 'atencao' || estado === 'normal'
    ? estado
    : 'sem_referencia'
}

/** Situação conhecida (ou "sem referência" para o que a API ainda não mandou). */
export function situacaoDoPonto(avaliacao: { situacao: string } | null | undefined): Situacao {
  const s = avaliacao?.situacao
  return s === 'avaliada' ||
    s === 'sem_referencia_completa' ||
    s === 'calibracao_diferente' ||
    s === 'nao_avaliavel'
    ? s
    : 'sem_referencia'
}

/**
 * Régua do desvio em unidades de z: o centro é o típico (z = 0) e os limites são os da API. O painel
 * não calcula referência: só posiciona o z que a API mandou.
 */
export function reguaEmZ(limites: { z_atencao: number; z_alarme: number }): Referencia {
  return {
    centro: 0,
    tolerancia: limites.z_atencao,
    atencao: limites.z_atencao,
    alarme: limites.z_alarme,
  }
}

/** Desvio de um valor pelo z que a API mandou: só acima do limite vira atenção ou alarme. */
export function desvioDoZ(
  z: number | null | undefined,
  limites: { z_atencao: number; z_alarme: number } | null | undefined,
): 'atencao' | 'alarme' | null {
  if (!limites || z === null || z === undefined || !Number.isFinite(z)) return null
  if (z >= limites.z_alarme) return 'alarme'
  return z >= limites.z_atencao ? 'atencao' : null
}

/** Classe do texto de um valor em desvio (âmbar ou vermelho, e só ele). */
export function classeDoDesvio(desvio: 'atencao' | 'alarme' | null): string {
  return desvio === 'alarme'
    ? 'text-alarme-texto'
    : desvio === 'atencao'
      ? 'text-atencao-texto'
      : ''
}

/**
 * Resumo da máquina a partir dos pontos de uma janela: o pior estado entre os pontos avaliados; se
 * nenhum foi avaliado, a situação do primeiro (o motivo comum: sem referência, por exemplo).
 */
export function resumoDosPontos(
  avaliacoes: readonly ({ situacao: string; estado?: string | null } | null | undefined)[],
): { situacao: string; estado: string | null } | null {
  const avaliadas = avaliacoes.filter((a) => avaliacaoDoPonto(a) !== 'sem_referencia')
  if (avaliadas.length > 0) {
    return { situacao: 'avaliada', estado: piorAvaliacao(avaliadas.map(avaliacaoDoPonto)) }
  }
  const primeira = avaliacoes.find((a) => a)
  return primeira ? { situacao: primeira.situacao, estado: null } : null
}

/** A pior avaliação de um conjunto (para resumir uma máquina a partir dos pontos). */
export function piorAvaliacao(avaliacoes: Avaliacao[]): Avaliacao {
  const ordem: Avaliacao[] = ['alarme', 'atencao', 'normal', 'sem_referencia']
  return ordem.find((a) => avaliacoes.includes(a)) ?? 'sem_referencia'
}

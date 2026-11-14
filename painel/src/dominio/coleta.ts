/**
 * Regras da Coleta que não dependem de tela: a grade de cobertura válida, a próxima gravação
 * sugerida e as definições de etapa e condição.
 *
 * A grade da API cruza todas as etapas com todas as condições e rotações. No protocolo, a condição só
 * muda o corte: em T0, T1 e T2 ela é sempre "normal"; T0 é o torno desligado, então a rotação alvo é 0.
 * A grade do painel é, então:
 *   T0 × normal × 0 rpm; T1 e T2 × normal × rotações do plano; T3 × 6 condições × rotações do plano.
 */

export type Etapa = 'T0' | 'T1' | 'T2' | 'T3'
export type Condicao =
  | 'normal'
  | 'ferramenta_desgastada'
  | 'avanco_excessivo'
  | 'rotacao_inadequada'
  | 'desbalanceamento'
  | 'sensor_solto'

export const ETAPAS: readonly Etapa[] = ['T0', 'T1', 'T2', 'T3']

/** Na ordem da sugestão: normal antes das outras, sensor_solto (validação) por último. */
export const CONDICOES: readonly Condicao[] = [
  'normal',
  'ferramenta_desgastada',
  'avanco_excessivo',
  'rotacao_inadequada',
  'desbalanceamento',
  'sensor_solto',
]

/** Condições de treino (as classes que um classificador vai aprender). */
export const CONDICOES_DE_TREINO: readonly Condicao[] = CONDICOES.filter(
  (c) => c !== 'sensor_solto',
)

export function usoDaCondicao(condicao: Condicao): 'treino' | 'validacao' {
  return condicao === 'sensor_solto' ? 'validacao' : 'treino'
}

export const ROTULO_ETAPA: Record<Etapa, string> = {
  T0: 'Torno desligado',
  T1: 'Girando em vazio',
  T2: 'Aproximação sem contato',
  T3: 'Corte',
}

/** Definição por extenso, logo abaixo dos botões de etapa. */
export const DEFINICAO_ETAPA: Record<Etapa, string> = {
  T0: 'Torno desligado, com a oficina funcionando.',
  T1: 'Torno girando em vazio, sem corte.',
  T2: 'Ferramenta se aproximando da peça, sem contato.',
  T3: 'Corte: a ferramenta tirando material da peça.',
}

export const ROTULO_CONDICAO: Record<Condicao, string> = {
  normal: 'Normal',
  ferramenta_desgastada: 'Ferramenta desgastada',
  avanco_excessivo: 'Avanço excessivo',
  rotacao_inadequada: 'Rotação inadequada',
  desbalanceamento: 'Desbalanceamento',
  sensor_solto: 'Sensor solto',
}

/** Rótulo curto (cabeçalho da matriz no celular). */
export const SIGLA_CONDICAO: Record<Condicao, string> = {
  normal: 'normal',
  ferramenta_desgastada: 'desgaste',
  avanco_excessivo: 'avanço',
  rotacao_inadequada: 'rotação',
  desbalanceamento: 'desbal.',
  sensor_solto: 'sensor solto',
}

/** Condições que valem para a etapa: só T3 tem outra além de normal. */
export function condicoesDaEtapa(etapa: Etapa): readonly Condicao[] {
  return etapa === 'T3' ? CONDICOES : ['normal']
}

/** Rotação alvo da etapa: T0 é sempre 0 (torno desligado). */
export function rotacaoDaEtapa(etapa: Etapa, rotacao: number): number {
  return etapa === 'T0' ? 0 : rotacao
}

export type ItemDeCobertura = {
  etapa: Etapa
  condicao: Condicao
  rotacao_alvo_rpm: number
  ensaios_validos: number
}

export type Celula = {
  etapa: Etapa
  condicao: Condicao
  rotacao: number
  uso: 'treino' | 'validacao'
  validos: number
  meta: number
  faltam: number
}

export function chaveDaCelula(c: { etapa: Etapa; condicao: Condicao; rotacao: number }): string {
  return `${c.etapa}|${c.condicao}|${c.rotacao}`
}

/** Rotações do plano sem repetição, em ordem crescente, sem o zero (que é só do T0). */
export function rotacoesDoPlano(plano: readonly number[]): number[] {
  return [...new Set(plano.filter((r) => Number.isFinite(r) && r > 0))].sort((a, b) => a - b)
}

/**
 * Grade válida, na ordem da sugestão (T0 → T1 → T2 → T3; rotações crescentes; no T3, normal antes
 * das outras e sensor_solto por último), com a contagem que a API devolveu para cada célula.
 */
export function gradeDeCobertura(
  itens: readonly ItemDeCobertura[],
  plano: readonly number[],
  meta: number,
): Celula[] {
  const contagem = new Map<string, number>()
  for (const item of itens) {
    const chave = chaveDaCelula({
      etapa: item.etapa,
      condicao: item.condicao,
      rotacao: item.rotacao_alvo_rpm,
    })
    contagem.set(chave, (contagem.get(chave) ?? 0) + item.ensaios_validos)
  }
  const rotacoes = rotacoesDoPlano(plano)
  const celula = (etapa: Etapa, condicao: Condicao, rotacao: number): Celula => {
    const validos = contagem.get(chaveDaCelula({ etapa, condicao, rotacao })) ?? 0
    return {
      etapa,
      condicao,
      rotacao,
      uso: usoDaCondicao(condicao),
      validos,
      meta,
      faltam: Math.max(0, meta - validos),
    }
  }
  const grade: Celula[] = [celula('T0', 'normal', 0)]
  for (const etapa of ['T1', 'T2'] as const) {
    for (const rotacao of rotacoes) grade.push(celula(etapa, 'normal', rotacao))
  }
  // T3: por condição (normal primeiro, sensor_solto por último), cada uma nas rotações crescentes
  for (const condicao of CONDICOES) {
    for (const rotacao of rotacoes) grade.push(celula('T3', condicao, rotacao))
  }
  return grade
}

/**
 * Próxima gravação sugerida: a célula com menos ensaios válidos em relação à meta; no empate, a
 * primeira na ordem da grade. Grade completa (ou vazia): nenhuma sugestão.
 */
export function proximaSugerida(grade: readonly Celula[]): Celula | null {
  let melhor: Celula | null = null
  for (const c of grade) {
    if (c.faltam <= 0) continue
    if (!melhor || c.validos / c.meta < melhor.validos / melhor.meta) melhor = c
  }
  return melhor
}

/** Percentual da grade feito (cada célula conta até a meta). */
export function percentualDaCobertura(grade: readonly Celula[]): number {
  const total = grade.reduce((soma, c) => soma + c.meta, 0)
  if (total === 0) return 0
  const feitos = grade.reduce((soma, c) => soma + Math.min(c.validos, c.meta), 0)
  return feitos / total
}

/** Rotações para pedir a cobertura à API: o zero do T0 mais as do plano. */
export function rotacoesDaConsulta(plano: readonly number[]): number[] {
  return [0, ...rotacoesDoPlano(plano)]
}

/** Próxima repetição sugerida para uma célula: os válidos dela mais um. */
export function repeticaoSugerida(celula: Pick<Celula, 'validos'> | null | undefined): number {
  return (celula?.validos ?? 0) + 1
}

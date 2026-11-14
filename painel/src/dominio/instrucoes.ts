/**
 * Cartão "o que fazer agora", sempre visível ao preparar e ao gravar. Textos fiéis ao protocolo; não
 * acrescente procedimento que não esteja aqui.
 */
import type { Condicao, Etapa } from './coleta'

export const INSTRUCAO_SEMPRE = 'Só o técnico liga e opera o torno. Proteção da placa fechada.'

export const INSTRUCAO_ETAPA: Record<Exclude<Etapa, 'T3'>, string> = {
  T0: 'Torno desligado. A oficina pode estar funcionando normalmente.',
  T1: 'Ligue o torno na rotação alvo, sem corte. Espere a rotação estabilizar antes do REC.',
  T2: 'Aproxime a ferramenta da peça sem encostar.',
}

export const INSTRUCAO_CORTE: Record<Condicao, string> = {
  normal: 'Corte com a receita indicada.',
  ferramenta_desgastada: 'Use a ferramenta separada como gasta.',
  avanco_excessivo: 'Avanço ou profundidade acima do recomendado, com o técnico.',
  rotacao_inadequada: 'Marcha errada para o diâmetro ou o material, com o técnico.',
  desbalanceamento: 'Só com o técnico e em rotação baixa.',
  sensor_solto: 'Afrouxe de propósito o ímã de um sensor por alguns segundos e anote qual.',
}

/** As frases do cartão para a etapa e a condição: a da etapa (ou do corte) e a de sempre. */
export function instrucoes(
  etapa: Etapa,
  condicao: Condicao,
): { principal: string; sempre: string } {
  return {
    principal: etapa === 'T3' ? INSTRUCAO_CORTE[condicao] : INSTRUCAO_ETAPA[etapa],
    sempre: INSTRUCAO_SEMPRE,
  }
}

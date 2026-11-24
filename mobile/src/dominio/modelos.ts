/**
 * Modelos da IA no app (só ADMIN, em Conta): nomes para mostrar, o aviso da validação e a frase de
 * consequência de ativar. Métricas, avisos e limiares vêm da API; nenhum número é escrito aqui.
 */

export const ROTULO_ESTADO_MODELO: Record<string, string> = {
  ativo: 'ATIVA',
  candidato: 'CANDIDATA',
  arquivado: 'ARQUIVADA',
}

/** O mesmo aviso do painel (TelaModelos.tsx), acima das métricas. */
export const AVISO_DA_VALIDACAO =
  'Limitação: a referência foi calculada com os mesmos ensaios que a validação testa, então recall e falso positivo estão otimistas e a comparação regra × modelo não é justa. Ative só depois de medir a memória no Render.'

const NOMES_DAS_CLASSES: Record<string, string> = {
  normal: 'normal',
  avanco_excessivo: 'avanço excessivo',
  rotacao_inadequada: 'rotação inadequada',
  ferramenta_desgastada: 'ferramenta desgastada',
  desbalanceamento: 'desbalanceamento',
  outra: 'outra',
}

export function nomeDaClasse(classe: string): string {
  return NOMES_DAS_CLASSES[classe] ?? classe.replaceAll('_', ' ')
}

/** Lista primeiro a ativa, depois as candidatas e as arquivadas; dentro de cada, a mais nova antes. */
export function ordenarModelos<T extends { estado: string; versao: number }>(modelos: readonly T[]): T[] {
  const ordem: Record<string, number> = { ativo: 0, candidato: 1, arquivado: 2 }
  return [...modelos].sort((a, b) => (ordem[a.estado] ?? 3) - (ordem[b.estado] ?? 3) || b.versao - a.versao)
}

/** O que acontece ao ativar, dito antes de segurar. */
export function consequenciaDeAtivar(versao: number, ativaAgora: number | null): string {
  const anterior = ativaAgora === null ? '' : ` A versão ${ativaAgora}, ativa hoje, vira arquivada.`
  return `A versão ${versao} passa a dar a segunda opinião nas próximas janelas.${anterior} O modelo nunca muda estado, prioridade nem abertura de alerta.`
}

/** Sem validação aplicável nem classificador: o detalhe diz que não há métricas, sem tabela vazia. */
export function temMetricas(v: { aplicavel: boolean; classificador?: unknown; comparacao?: unknown }): boolean {
  return v.aplicavel && Boolean(v.classificador || v.comparacao)
}

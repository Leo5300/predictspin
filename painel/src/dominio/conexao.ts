/**
 * Estado da conexão com a API. A API gratuita hiberna e leva cerca de um minuto para acordar: por
 * isso uma falha de rede com o navegador conectado é tratada primeiro como "API acordando" (com
 * novas tentativas de espera crescente) e só vira "sem conexão" se passar do tempo esperado.
 */

export type EstadoConexao = 'ok' | 'acordando' | 'sem_conexao'

/** Depois deste tempo falhando, deixa de ser "acordando". */
export const TEMPO_PARA_ACORDAR_S = 150

/** Resposta que demora mais que isto já indica que a API está acordando. */
export const DEMORA_SUSPEITA_S = 6

const ESPERAS_S = [2, 3, 5, 8, 10, 15]

/** Espera antes da n-ésima nova tentativa (n começa em 1). */
export function esperaDaTentativaS(tentativa: number): number {
  const indice = Math.min(Math.max(1, Math.floor(tentativa)), ESPERAS_S.length) - 1
  return ESPERAS_S[indice] ?? 15
}

export type SituacaoDaRede = {
  /** navigator.onLine */
  navegadorConectado: boolean
  /** Instante (ms) da primeira falha da sequência atual; nulo se a última chamada deu certo. */
  falhandoDesdeMs: number | null
}

export function estadoDaConexao(situacao: SituacaoDaRede, agoraMs: number): EstadoConexao {
  if (!situacao.navegadorConectado) return 'sem_conexao'
  if (situacao.falhandoDesdeMs === null) return 'ok'
  return agoraMs - situacao.falhandoDesdeMs <= TEMPO_PARA_ACORDAR_S * 1000
    ? 'acordando'
    : 'sem_conexao'
}

/** Status HTTP que indicam servidor ainda subindo atrás do proxy, não erro da aplicação. */
export function statusDeApiAcordando(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

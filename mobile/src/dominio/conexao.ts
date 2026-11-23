/**
 * Estado da conexão com a API. A API gratuita do Render hiberna e leva cerca de um minuto para
 * acordar: uma falha de rede com o aparelho conectado é tratada primeiro como "acordando o servidor"
 * (com novas tentativas de espera crescente) e só vira "sem conexão" se passar do tempo esperado ou
 * se o aparelho estiver sem rede. Mesmas esperas do painel.
 */

export type EstadoConexao = 'ok' | 'acordando' | 'sem_conexao'

/** Depois deste tempo falhando, deixa de ser "acordando". */
export const TEMPO_PARA_ACORDAR_S = 150

/** Resposta que demora mais que isto já indica que a API está acordando. */
export const DEMORA_SUSPEITA_S = 6

/** Tempo máximo de uma chamada comum; o servidor acordando pode levar perto de 1 min. */
export const TEMPO_MAXIMO_DA_CHAMADA_S = 75

const ESPERAS_S = [2, 3, 5, 8, 10, 15]

/** Espera antes da n-ésima nova tentativa (n começa em 1). */
export function esperaDaTentativaS(tentativa: number): number {
  const indice = Math.min(Math.max(1, Math.floor(tentativa)), ESPERAS_S.length) - 1
  return ESPERAS_S[indice] ?? 15
}

export type SituacaoDaRede = {
  /** O sistema diz que o aparelho tem rede (Wi-Fi ou dados). */
  aparelhoConectado: boolean
  /** Instante (ms) da primeira falha da sequência atual; nulo se a última chamada deu certo. */
  falhandoDesdeMs: number | null
}

export function estadoDaConexao(situacao: SituacaoDaRede, agoraMs: number): EstadoConexao {
  if (!situacao.aparelhoConectado) return 'sem_conexao'
  if (situacao.falhandoDesdeMs === null) return 'ok'
  return agoraMs - situacao.falhandoDesdeMs <= TEMPO_PARA_ACORDAR_S * 1000
    ? 'acordando'
    : 'sem_conexao'
}

/** Status HTTP que indicam servidor ainda subindo atrás do proxy, não erro da aplicação. */
export function statusDeApiAcordando(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

/** Como os dados chegam: eventos ao vivo, consulta periódica enquanto reconecta, ou nada. */
export type Transporte = 'conectando' | 'ao_vivo' | 'reconectando'

export type IndicadorConexao = {
  /** Texto curto da barra superior. */
  texto: string
  /** "ok" fica neutro; o resto é desvio de conexão (não de máquina: nunca âmbar ou vermelho). */
  tom: 'ok' | 'aviso'
  /** Ações que escrevem na API (reconhecer, suprimir) só com a API respondendo. */
  podeEscrever: boolean
}

export function indicadorDaConexao(conexao: EstadoConexao, transporte: Transporte): IndicadorConexao {
  if (conexao === 'sem_conexao') return { texto: 'sem conexão', tom: 'aviso', podeEscrever: false }
  if (conexao === 'acordando')
    return { texto: 'acordando o servidor', tom: 'aviso', podeEscrever: false }
  if (transporte === 'ao_vivo') return { texto: 'ao vivo', tom: 'ok', podeEscrever: true }
  if (transporte === 'conectando') return { texto: 'conectando', tom: 'ok', podeEscrever: true }
  return { texto: 'reconectando · consulta a cada 5 s', tom: 'aviso', podeEscrever: true }
}

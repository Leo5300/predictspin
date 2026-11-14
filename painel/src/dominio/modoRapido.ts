/**
 * Modo rápido (AO VIVO): um usuário pede janelas de 1 s por 2 minutos. O painel renova o pedido
 * antes do prazo enquanto o gráfico estiver visível.
 */

export const DURACAO_MODO_RAPIDO_S = 120

/** Renova quando faltar isto ou menos para o prazo. */
export const RENOVAR_FALTANDO_S = 30

/** Segundos até o prazo, no relógio do servidor. Zero se não há prazo ou ele já passou. */
export function segundosRestantes(
  prazoIso: string | null | undefined,
  agoraServidorMs: number,
): number {
  if (!prazoIso) return 0
  const prazo = Date.parse(prazoIso)
  if (Number.isNaN(prazo)) return 0
  return Math.max(0, (prazo - agoraServidorMs) / 1000)
}

export function modoRapidoAtivo(
  prazoIso: string | null | undefined,
  agoraServidorMs: number,
): boolean {
  return segundosRestantes(prazoIso, agoraServidorMs) > 0
}

export function deveRenovar(restantesS: number): boolean {
  return restantesS > 0 && restantesS <= RENOVAR_FALTANDO_S
}

/**
 * Diferença entre o relógio do servidor e o do navegador, em ms. A resposta de "ligar" diz o prazo,
 * que é o agora do servidor mais a duração: daí sai o agora do servidor sem depender do acerto do
 * relógio local.
 */
export function desvioPeloPrazo(prazoIso: string, agoraClienteMs: number): number {
  return Date.parse(prazoIso) - DURACAO_MODO_RAPIDO_S * 1000 - agoraClienteMs
}

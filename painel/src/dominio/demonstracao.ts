/**
 * Barra de demonstração: os quatro níveis que a API aceita, o texto de cada um, as teclas de atalho e a
 * contagem "volta ao normal em mm:ss". Nada aqui decide estado: o que está ligado é sempre o que a API
 * respondeu.
 */

export type NivelDemo = 'PARADA' | 'NORMAL' | 'ATENCAO' | 'ALARME'

/** Os três níveis com botão grande. PARADA tem o botão pequeno "Parar". */
export const NIVEIS_DO_BOTAO = ['NORMAL', 'ATENCAO', 'ALARME'] as const
export type NivelDoBotao = (typeof NIVEIS_DO_BOTAO)[number]

export const ROTULO_DO_NIVEL: Record<NivelDemo, string> = {
  PARADA: 'PARADA',
  NORMAL: 'NORMAL',
  ATENCAO: 'ATENÇÃO',
  ALARME: 'ALARME',
}

/** Tecla de cada nível: 1 Normal, 2 Atenção, 3 Alarme, 0 Parar. */
export const TECLA_DO_NIVEL: Record<NivelDemo, string> = {
  PARADA: '0',
  NORMAL: '1',
  ATENCAO: '2',
  ALARME: '3',
}

export function nivelDaTecla(tecla: string): NivelDemo | null {
  const achado = (Object.entries(TECLA_DO_NIVEL) as [NivelDemo, string][]).find(
    ([, t]) => t === tecla,
  )
  return achado ? achado[0] : null
}

const TAGS_DE_CAMPO = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const PAPEIS_DE_CAMPO = new Set(['textbox', 'combobox', 'searchbox', 'spinbutton', 'listbox'])

/** O foco está num lugar onde se digita: o atalho não pode roubar a tecla. */
export function focoEmCampo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  if (TAGS_DE_CAMPO.has(alvo.tagName) || alvo.isContentEditable) return true
  const papel = alvo.getAttribute('role')
  return papel !== null && PAPEIS_DE_CAMPO.has(papel)
}

/** Tecla de atalho de uma tecla pressionada, ou nulo (modificadora, repetição, foco em campo). */
export function atalhoDoEvento(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey?: boolean
  repeat?: boolean
  target: EventTarget | null
}): NivelDemo | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null
  if (focoEmCampo(e.target)) return null
  return nivelDaTecla(e.key)
}

/** Segundos em "mm:ss" (nunca negativo). */
export function formatarContagem(segundos: number): string {
  const total = Math.max(0, Math.ceil(segundos))
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
}

/**
 * Segundos que faltam para voltar a NORMAL, contados a partir da resposta da API: o valor que ela deu
 * menos o tempo que passou desde que chegou. Nulo quando a API não deu contagem (NORMAL ou PARADA).
 */
export function segundosParaVoltar(
  voltaNormalEmS: number | null | undefined,
  respondidoEmMs: number,
  agoraMs: number,
): number | null {
  if (voltaNormalEmS === null || voltaNormalEmS === undefined) return null
  // o relógio de 1 s pode estar um instante atrás da resposta: nunca conta mais do que a API disse
  const passouS = Math.max(0, (agoraMs - respondidoEmMs) / 1000)
  return Math.max(0, voltaNormalEmS - passouS)
}

/** Texto lido pelo leitor de tela quando o nível muda. Vem da mensagem da API. */
export function anuncioDoNivel(nivel: NivelDemo, mensagem: string): string {
  return `Demonstração em ${ROTULO_DO_NIVEL[nivel]}. ${mensagem}`
}

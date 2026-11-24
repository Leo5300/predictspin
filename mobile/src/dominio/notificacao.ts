/**
 * Regras do push no app, sem nada do aparelho: para onde o toque leva, por que o push não existe neste
 * modo, o que fazer com a permissão do sistema e o que cada papel recebe.
 *
 * O conteúdo do push vem da API (PushService.java): "tipo" alarme ou alerta (alarme de instrumento) com
 * alerta_id, ou os com os_id; mais maquina_id e simulado. O que não tiver esse formato só abre o app.
 */
import type { Papel } from './permissoes'

export type DestinoDaNotificacao =
  | { tela: 'alarme'; alertaId: number; simulado: boolean }
  | { tela: 'os'; osId: number; simulado: boolean }

function inteiro(valor: unknown): number | null {
  const n = typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : valor
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null
}

/** Os dados chegam como JSON; no Android, um campo pode vir como texto ("12", "true"). */
export function destinoDaNotificacao(dados: unknown): DestinoDaNotificacao | null {
  if (typeof dados !== 'object' || dados === null) return null
  const d = dados as Record<string, unknown>
  const simulado = d.simulado === true || d.simulado === 'true'
  if (d.tipo === 'alarme' || d.tipo === 'alerta') {
    const alertaId = inteiro(d.alerta_id)
    return alertaId === null ? null : { tela: 'alarme', alertaId, simulado }
  }
  if (d.tipo === 'os') {
    const osId = inteiro(d.os_id)
    return osId === null ? null : { tela: 'os', osId, simulado }
  }
  return null
}

export type SemPush = 'expo_go' | 'web' | 'sem_projeto'

export type AmbienteDoPush = {
  expoGo: boolean
  plataforma: string
  /** Identificador do projeto no EAS (gravado no app.json pelo `eas init`). */
  projectId: string | null
}

/**
 * Expo Go (SDK 53 em diante) não recebe push em nenhum sistema; o navegador também não. Sem o
 * projeto do EAS, o Expo não entrega um token.
 */
export function porQueSemPush(ambiente: AmbienteDoPush): SemPush | null {
  if (ambiente.expoGo) return 'expo_go'
  if (ambiente.plataforma !== 'android' && ambiente.plataforma !== 'ios') return 'web'
  if (!ambiente.projectId) return 'sem_projeto'
  return null
}

export const EXPLICACAO_SEM_PUSH: Record<SemPush, string> = {
  expo_go:
    'O Expo Go não recebe notificações remotas. Para receber alarmes no celular, use o app de teste instalado (APK no Android).',
  web: 'No navegador não há notificações do app.',
  sem_projeto: 'Este build não tem o projeto do Expo configurado, e sem ele o celular não recebe push.',
}

export type PermissaoDoSistema = { granted: boolean; status: string; canAskAgain: boolean }

export type SituacaoDaPermissao = {
  concedida: boolean
  /** A janela do sistema ainda pode aparecer (nunca perguntado, ou negado uma vez no Android). */
  podePedir: boolean
  /** Mostrar o pedido do app (uma frase dizendo para quê) depois do login: só se nunca perguntado. */
  oferecer: boolean
}

export function situacaoDaPermissao(permissao: PermissaoDoSistema, adiada: boolean): SituacaoDaPermissao {
  if (permissao.granted) return { concedida: true, podePedir: false, oferecer: false }
  const nuncaPerguntado = permissao.status === 'undetermined'
  return {
    concedida: false,
    podePedir: nuncaPerguntado || permissao.canAskAgain,
    oferecer: nuncaPerguntado && !adiada,
  }
}

/** Espelha os destinatários da API: alarme para todos; OS aberta e sensor só para quem conserta. */
export function oQueChegaPorPush(papel: Papel): string {
  return papel === 'OPERADOR'
    ? 'alarme novo'
    : 'alarme novo, OS aberta e problema de sensor'
}

/** Onde o push deste celular está. "desligado" = sem permissão do sistema. */
export type EstadoDoPush =
  | { fase: 'verificando' }
  | { fase: 'indisponivel'; motivo: SemPush }
  | { fase: 'desligado'; podePedir: boolean; oferecer: boolean }
  | { fase: 'registrando' }
  | { fase: 'registrado'; envioHabilitado: boolean }
  | { fase: 'falhou'; onde: 'expo' | 'api' }

export type ResumoDoPush = {
  texto: string
  detalhe: string | null
  acao: 'ligar' | 'configuracoes' | 'tentar' | null
}

/** O que a Conta mostra sobre as notificações e qual botão oferece. */
export function resumoDoPush(estado: EstadoDoPush, papel: Papel): ResumoDoPush {
  const chegam = oQueChegaPorPush(papel)
  switch (estado.fase) {
    case 'verificando':
      return { texto: 'Conferindo…', detalhe: null, acao: null }
    case 'indisponivel':
      return {
        texto: 'Notificações indisponíveis neste modo.',
        detalhe: EXPLICACAO_SEM_PUSH[estado.motivo],
        acao: null,
      }
    case 'desligado':
      return estado.podePedir
        ? { texto: 'Desligadas neste celular.', detalhe: `Ligue para receber: ${chegam}.`, acao: 'ligar' }
        : {
            texto: 'Desligadas nas configurações do celular.',
            detalhe: 'Ligue as notificações do PredictSpin nas configurações do sistema.',
            acao: 'configuracoes',
          }
    case 'registrando':
      return { texto: 'Registrando este celular…', detalhe: null, acao: null }
    case 'registrado':
      return estado.envioHabilitado
        ? { texto: 'Ligadas.', detalhe: `Chegam: ${chegam}. Nunca a cada janela.`, acao: null }
        : {
            texto: 'Este celular está registrado, mas o envio de push está desligado na API.',
            detalhe: 'Quem administra a API precisa ligar o envio.',
            acao: null,
          }
    case 'falhou':
      return estado.onde === 'expo'
        ? {
            texto: 'O celular não conseguiu o endereço de push.',
            detalhe: 'Confira a internet e tente de novo.',
            acao: 'tentar',
          }
        : { texto: 'A API não registrou este celular.', detalhe: 'Confira a conexão e tente de novo.', acao: 'tentar' }
  }
}

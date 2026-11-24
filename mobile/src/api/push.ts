/**
 * Push de alarme no celular. O app pede a permissão depois do primeiro login (com uma frase dizendo para
 * quê), registra o token do Expo na API a cada sessão (PUT /api/v1/push/aparelhos) e o remove ao sair,
 * antes de apagar a sessão. No Expo Go e no navegador não há push: o app segue igual, e a Conta diz por quê.
 *
 * O expo-notifications só é carregado onde há push: no Expo Go, só importá-lo já escreve avisos.
 */
import { isRunningInExpoGo } from 'expo'
import Constants from 'expo-constants'
import type * as ExpoNotificacoes from 'expo-notifications'
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

import {
  destinoDaNotificacao,
  porQueSemPush,
  situacaoDaPermissao,
  type AmbienteDoPush,
  type DestinoDaNotificacao,
  type EstadoDoPush,
  type SemPush,
} from '@/dominio/notificacao'

import { apagar, CHAVES, gravar, ler } from './armazenamento'
import { api, exigir } from './cliente'

type Notificacoes = typeof ExpoNotificacoes

/** O mesmo canal que a API põe em cada mensagem (PushService.CANAL_ANDROID). */
export const CANAL_ANDROID = 'alarmes'

/** O Expo pode demorar a entregar o token; sem resposta, o registro vira "tentar de novo". */
const LIMITE_DO_TOKEN_MS = 15_000
/** Sair não espera a API: sem resposta em 3 s, a sessão é apagada mesmo assim. */
const LIMITE_AO_SAIR_MS = 3_000

let modulo: Notificacoes | null = null
let ambienteFixo: AmbienteDoPush | null = null
let estado: EstadoDoPush = { fase: 'verificando' }
const ouvintes = new Set<() => void>()
/** Token deste aparelho, para remover ao sair. Nunca vai para log nem para a tela. */
let tokenDoAparelho: string | null = null
/** Cada registro tem um número; só o mais recente publica o resultado. */
let rodada = 0
let exibicaoConfigurada = false
/** Toques já abertos (os últimos), para a mesma notificação não abrir duas vezes. */
const toquesAbertos: string[] = []
const LEMBRAR_TOQUES = 20

function notificacoes(): Notificacoes {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- carregado só onde há push (ver acima)
  modulo ??= require('expo-notifications') as Notificacoes
  return modulo
}

function publicar(novo: EstadoDoPush) {
  estado = novo
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function obterEstadoDoPush(): EstadoDoPush {
  return estado
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function useEstadoDoPush(): EstadoDoPush {
  return useSyncExternalStore(assinar, obterEstadoDoPush)
}

export function lerAmbiente(): AmbienteDoPush {
  if (ambienteFixo) return ambienteFixo
  const projectId: unknown =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null
  return {
    expoGo: isRunningInExpoGo(),
    plataforma: Platform.OS,
    projectId: typeof projectId === 'string' && projectId ? projectId : null,
  }
}

function semPush(): SemPush | null {
  return porQueSemPush(lerAmbiente())
}

function limitar<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    const limite = setTimeout(() => rejeitar(new Error('tempo esgotado')), ms)
    promessa.then(
      (valor) => {
        clearTimeout(limite)
        resolver(valor)
      },
      (erro: unknown) => {
        clearTimeout(limite)
        rejeitar(erro)
      },
    )
  })
}

/**
 * Com o app na frente, a notificação aparece como faixa, sem som: o app mostra os alarmes ao vivo só da
 * fonte escolhida (real ou simulado), e um alarme real não pode passar despercebido enquanto se olha o
 * simulado.
 */
function configurarExibicao(n: Notificacoes) {
  if (exibicaoConfigurada) return
  exibicaoConfigurada = true
  n.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
}

/** Android: o canal "alarmes", com importância alta. Precisa existir antes de pedir permissão e token. */
async function prepararCanal(n: Notificacoes) {
  if (lerAmbiente().plataforma !== 'android') return
  await n.setNotificationChannelAsync(CANAL_ANDROID, {
    name: 'Alarmes',
    description: 'Alarme novo, OS aberta e problema de sensor do torno',
    importance: n.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  })
}

/**
 * Lê a permissão e, se concedida, registra este celular na API para a conta em uso (o mesmo token com
 * outra pessoa passa a ser dela). Pode ser chamado de novo a qualquer momento.
 */
export async function atualizarRegistro(): Promise<void> {
  const minha = ++rodada
  const vale = () => minha === rodada
  const motivo = semPush()
  if (motivo) {
    publicar({ fase: 'indisponivel', motivo })
    return
  }
  const n = notificacoes()
  configurarExibicao(n)
  let situacao
  try {
    const adiada = (await ler(CHAVES.notificacoes)) === 'adiada'
    situacao = situacaoDaPermissao(await n.getPermissionsAsync(), adiada)
  } catch {
    if (vale()) publicar({ fase: 'falhou', onde: 'expo' })
    return
  }
  if (!vale()) return
  if (!situacao.concedida) {
    publicar({ fase: 'desligado', podePedir: situacao.podePedir, oferecer: situacao.oferecer })
    return
  }
  publicar({ fase: 'registrando' })
  const { projectId, plataforma } = lerAmbiente()
  let token: string
  try {
    await prepararCanal(n)
    token = (await limitar(n.getExpoPushTokenAsync({ projectId: projectId ?? undefined }), LIMITE_DO_TOKEN_MS))
      .data
  } catch {
    // sem internet, ou build sem o Firebase (Android): o celular não recebe o token do Expo
    if (vale()) publicar({ fase: 'falhou', onde: 'expo' })
    return
  }
  if (!vale()) return
  // guardado antes da resposta: quem sai durante o registro ainda remove o aparelho
  tokenDoAparelho = token
  try {
    const resposta = await exigir(
      api.PUT('/api/v1/push/aparelhos', {
        body: { token, plataforma: plataforma === 'ios' ? 'ios' : 'android' },
      }),
    )
    if (vale()) publicar({ fase: 'registrado', envioHabilitado: resposta.envio_habilitado })
  } catch {
    if (vale()) publicar({ fase: 'falhou', onde: 'api' })
  }
}

/** "Permitir" no pedido do app, ou "Ligar notificações" em Conta: a janela do sistema e o registro. */
export async function pedirPermissao(): Promise<void> {
  if (semPush()) return
  const n = notificacoes()
  try {
    // Android 13 em diante: a janela do sistema só aparece se já existe um canal
    await prepararCanal(n)
    await n.requestPermissionsAsync()
  } catch {
    /* o registro abaixo lê a permissão como ela ficou */
  }
  await apagar(CHAVES.notificacoes)
  await atualizarRegistro()
}

/** "Agora não": o pedido não volta sozinho; a Conta continua oferecendo ligar. */
export async function adiarPedido(): Promise<void> {
  await gravar(CHAVES.notificacoes, 'adiada')
  if (estado.fase === 'desligado') publicar({ ...estado, oferecer: false })
}

/**
 * Ao sair, antes de apagar a sessão: a API para de mandar push desta conta para este celular. Falha ou
 * demora não segura a saída; o token fica na API até outra pessoa entrar neste celular ou o Expo dizer
 * que ele não existe mais.
 */
export async function removerAparelho(): Promise<void> {
  const token = tokenDoAparelho
  if (!token) return
  const controle = new AbortController()
  const limite = setTimeout(() => controle.abort(), LIMITE_AO_SAIR_MS)
  try {
    await api.POST('/api/v1/push/aparelhos/remover', { body: { token }, signal: controle.signal })
  } catch {
    /* sem rede ou sem resposta: sai do mesmo jeito */
  } finally {
    clearTimeout(limite)
  }
}

/**
 * Toques em notificação: a que abriu o app (app fechado ou sessão travada) e as que chegam com ele aberto.
 * Cada toque é entregue uma vez, mesmo que as abas montem de novo. Devolve a função que para de ouvir.
 */
export function ouvirToques(aoTocar: (destino: DestinoDaNotificacao) => void): () => void {
  if (semPush()) return () => undefined
  const n = notificacoes()
  const tratar = (resposta: ExpoNotificacoes.NotificationResponse | null) => {
    if (!resposta || resposta.actionIdentifier !== n.DEFAULT_ACTION_IDENTIFIER) return
    const id = resposta.notification.request.identifier
    if (toquesAbertos.includes(id)) return
    toquesAbertos.push(id)
    if (toquesAbertos.length > LEMBRAR_TOQUES) toquesAbertos.shift()
    void n.clearLastNotificationResponseAsync().catch(() => undefined)
    const destino = destinoDaNotificacao(resposta.notification.request.content.data)
    if (destino) aoTocar(destino)
  }
  const assinatura = n.addNotificationResponseReceivedListener(tratar)
  void n.getLastNotificationResponseAsync().then(tratar, () => undefined)
  return () => assinatura.remove()
}

/** Fim da sessão (as abas desmontam): o estado volta ao começo; um registro em curso é descartado. */
export function esquecerPush() {
  rodada++
  tokenDoAparelho = null
  publicar({ fase: 'verificando' })
}

/** Só para testes. */
export function fixarAmbienteParaTeste(ambiente: AmbienteDoPush | null) {
  ambienteFixo = ambiente
}

/** Só para testes: volta ao estado inicial. */
export function reiniciarPushParaTeste() {
  esquecerPush()
  ouvintes.clear()
  exibicaoConfigurada = false
  toquesAbertos.length = 0
  ambienteFixo = null
}

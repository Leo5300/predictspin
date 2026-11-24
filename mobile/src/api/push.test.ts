import * as Notificacoes from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import { simularApi } from '@/testes/ajudantes'
import { respostaLogin } from '@/testes/exemplos'

import { CHAVES } from './armazenamento'
import { sair } from './autenticacao'
import {
  adiarPedido,
  atualizarRegistro,
  CANAL_ANDROID,
  esquecerPush,
  fixarAmbienteParaTeste,
  lerAmbiente,
  obterEstadoDoPush,
  ouvirToques,
  pedirPermissao,
  reiniciarPushParaTeste,
  removerAparelho,
} from './push'
import { reiniciarSaudeParaTeste } from './saude'
import { iniciarSessao, obterSessao, reiniciarSessaoParaTeste } from './sessao'

const n = Notificacoes as jest.Mocked<typeof Notificacoes>
const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado

type Permissao = Awaited<ReturnType<typeof Notificacoes.getPermissionsAsync>>
const permissao = (p: { granted: boolean; status: string; canAskAgain: boolean }) =>
  ({ ...p, expires: 'never' }) as Permissao
const NAO_PERGUNTADA = permissao({ granted: false, status: 'undetermined', canAskAgain: true })
const PERMITIDA = permissao({ granted: true, status: 'granted', canAskAgain: true })

const ANDROID = { expoGo: false, plataforma: 'android', projectId: 'projeto-teste' }
const TOKEN = 'ExponentPushToken[teste]'
const aparelho = (envio = true) => ({
  id: 1,
  plataforma: 'android',
  ativo: true,
  criado_em: '2026-11-24T10:00:00Z',
  ultimo_uso_em: '2026-11-24T10:00:00Z',
  envio_habilitado: envio,
})

/** Deixa correr as promessas pendentes (SecureStore, permissão, token, fetch simulado). */
const esvaziar = () => new Promise((resolver) => setTimeout(resolver, 0))

function resposta(id: string, dados: unknown, acao: string = n.DEFAULT_ACTION_IDENTIFIER) {
  return {
    actionIdentifier: acao,
    notification: { request: { identifier: id, content: { data: dados } } },
  } as unknown as Notificacoes.NotificationResponse
}

beforeEach(() => {
  jest.useRealTimers()
  jest.clearAllMocks()
  guardado.clear()
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  reiniciarPushParaTeste()
  fixarAmbienteParaTeste(ANDROID)
  n.getPermissionsAsync.mockResolvedValue(NAO_PERGUNTADA)
  n.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN })
  n.getLastNotificationResponseAsync.mockResolvedValue(null)
})

afterAll(() => {
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  reiniciarPushParaTeste()
})

describe('onde não há push', () => {
  it('Expo Go: indisponível, sem tocar no módulo de notificações', async () => {
    fixarAmbienteParaTeste({ ...ANDROID, expoGo: true })
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'indisponivel', motivo: 'expo_go' })
    await pedirPermissao()
    const parar = ouvirToques(jest.fn())
    parar()
    expect(n.getPermissionsAsync).not.toHaveBeenCalled()
    expect(n.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(n.addNotificationResponseReceivedListener).not.toHaveBeenCalled()
  })

  it('build sem o projeto do EAS: indisponível', async () => {
    fixarAmbienteParaTeste({ ...ANDROID, projectId: null })
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'indisponivel', motivo: 'sem_projeto' })
  })

  it('sem ambiente fixo, lê a plataforma e o projeto do app.json (sem eas init: nenhum)', () => {
    fixarAmbienteParaTeste(null)
    // o jest-expo se apresenta como Expo Go; aqui só importa que o valor venha do Expo
    expect(lerAmbiente()).toEqual({ expoGo: expect.any(Boolean), plataforma: Platform.OS, projectId: null })
  })
})

describe('permissão e registro', () => {
  it('nunca perguntada: oferece o pedido, sem abrir a janela do sistema nem pedir token', async () => {
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'desligado', podePedir: true, oferecer: true })
    expect(n.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(n.getExpoPushTokenAsync).not.toHaveBeenCalled()
  })

  it('"agora não" fica gravado e o pedido não volta na próxima sessão', async () => {
    await atualizarRegistro()
    await adiarPedido()
    expect(guardado.get(CHAVES.notificacoes)).toBe('adiada')
    expect(obterEstadoDoPush()).toEqual({ fase: 'desligado', podePedir: true, oferecer: false })
    esquecerPush()
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'desligado', podePedir: true, oferecer: false })
  })

  it('permitir: canal "alarmes" antes da janela do sistema; depois o token vai para a API com a sessão', async () => {
    const { pedidos } = simularApi({ 'PUT /api/v1/push/aparelhos': () => ({ corpo: aparelho() }) })
    await iniciarSessao(respostaLogin())
    await adiarPedido()
    n.requestPermissionsAsync.mockImplementationOnce(async () => {
      n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
      return PERMITIDA
    })
    await pedirPermissao()

    expect(n.setNotificationChannelAsync).toHaveBeenCalledWith(
      CANAL_ANDROID,
      expect.objectContaining({ name: 'Alarmes', importance: n.AndroidImportance.HIGH }),
    )
    expect(n.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(
      n.requestPermissionsAsync.mock.invocationCallOrder[0]!,
    )
    expect(n.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'projeto-teste' })
    const registro = pedidos.find((p) => p.metodo === 'PUT')
    expect(registro?.caminho).toBe('/api/v1/push/aparelhos')
    expect(registro?.corpo).toEqual({ token: TOKEN, plataforma: 'android' })
    expect(registro?.cabecalhos.get('Authorization')).toBe(`Bearer ${respostaLogin().token}`)
    expect(obterEstadoDoPush()).toEqual({ fase: 'registrado', envioHabilitado: true })
    expect(guardado.has(CHAVES.notificacoes)).toBe(false)
    expect(n.setNotificationHandler).toHaveBeenCalledTimes(1)
  })

  it('com o app na frente, a notificação aparece em faixa, sem som', async () => {
    await atualizarRegistro()
    const tratador = n.setNotificationHandler.mock.calls[0]![0]!
    await expect(tratador.handleNotification({} as Notificacoes.Notification)).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    })
  })

  it('iPhone: sem canal, plataforma ios na API', async () => {
    fixarAmbienteParaTeste({ ...ANDROID, plataforma: 'ios' })
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    const { pedidos } = simularApi({ 'PUT /api/v1/push/aparelhos': () => ({ corpo: aparelho() }) })
    await atualizarRegistro()
    expect(n.setNotificationChannelAsync).not.toHaveBeenCalled()
    expect(pedidos[0]?.corpo).toEqual({ token: TOKEN, plataforma: 'ios' })
  })

  it('API com o envio desligado: registrado, e a Conta avisa', async () => {
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    simularApi({ 'PUT /api/v1/push/aparelhos': () => ({ corpo: aparelho(false) }) })
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'registrado', envioHabilitado: false })
  })

  it('negada sem poder perguntar de novo: desligado, sem pedido', async () => {
    n.getPermissionsAsync.mockResolvedValue(permissao({ granted: false, status: 'denied', canAskAgain: false }))
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'desligado', podePedir: false, oferecer: false })
  })

  it('sem token do Expo (sem internet ou build sem Firebase): falha no Expo; API recusando: falha na API', async () => {
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    n.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('Default FirebaseApp is not initialized'))
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'falhou', onde: 'expo' })

    simularApi({ 'PUT /api/v1/push/aparelhos': () => ({ status: 400, corpo: { status: 400, mensagem: 'x' } }) })
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'falhou', onde: 'api' })
  })

  it('permissão que não pode ser lida: falha no Expo', async () => {
    n.getPermissionsAsync.mockRejectedValueOnce(new Error('módulo nativo ausente'))
    await atualizarRegistro()
    expect(obterEstadoDoPush()).toEqual({ fase: 'falhou', onde: 'expo' })
  })

  it('token que não chega em 15 s vira "tentar de novo"', async () => {
    jest.useFakeTimers()
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    n.getExpoPushTokenAsync.mockImplementationOnce(() => new Promise(() => undefined))
    const registro = atualizarRegistro()
    await jest.advanceTimersByTimeAsync(15_000)
    await registro
    expect(obterEstadoDoPush()).toEqual({ fase: 'falhou', onde: 'expo' })
  })

  it('a janela do sistema que falha não derruba: o registro lê a permissão como ficou', async () => {
    n.requestPermissionsAsync.mockRejectedValueOnce(new Error('falhou'))
    await pedirPermissao()
    expect(obterEstadoDoPush()).toEqual({ fase: 'desligado', podePedir: true, oferecer: true })
  })

  it('registro em curso é descartado quando a sessão acaba', async () => {
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    const { pedidos } = simularApi({ 'PUT /api/v1/push/aparelhos': () => ({ corpo: aparelho() }) })
    let soltar: (valor: Notificacoes.ExpoPushToken) => void = () => undefined
    n.getExpoPushTokenAsync.mockImplementationOnce(
      () =>
        new Promise((resolver) => {
          soltar = resolver
        }),
    )
    const registro = atualizarRegistro()
    await esvaziar()
    expect(obterEstadoDoPush()).toEqual({ fase: 'registrando' })
    esquecerPush()
    soltar({ type: 'expo', data: TOKEN })
    await registro
    expect(obterEstadoDoPush()).toEqual({ fase: 'verificando' })
    expect(pedidos).toHaveLength(0)
  })
})

describe('sair', () => {
  it('remove o aparelho com a sessão ainda valendo; depois apaga a sessão e o "agora não"', async () => {
    let naHoraDeRemover: { autorizacao: string | null; sessaoGuardada: boolean; corpo: unknown } | null = null
    simularApi({
      'PUT /api/v1/push/aparelhos': () => ({ corpo: aparelho() }),
      'POST /api/v1/push/aparelhos/remover': ({ cabecalhos, corpo }) => {
        naHoraDeRemover = {
          autorizacao: cabecalhos.get('Authorization'),
          sessaoGuardada: guardado.has(CHAVES.sessao),
          corpo,
        }
        return { status: 204 }
      },
    })
    await iniciarSessao(respostaLogin())
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    await atualizarRegistro()
    guardado.set(CHAVES.notificacoes, 'adiada')

    await sair()
    expect(naHoraDeRemover).toEqual({
      autorizacao: `Bearer ${respostaLogin().token}`,
      sessaoGuardada: true,
      corpo: { token: TOKEN },
    })
    expect(guardado.has(CHAVES.sessao)).toBe(false)
    expect(guardado.has(CHAVES.notificacoes)).toBe(false)
    expect(obterSessao().fase).toBe('anonima')
  })

  it('sem aparelho registrado, sair não chama a API', async () => {
    const { pedidos } = simularApi({})
    await removerAparelho()
    expect(pedidos).toHaveLength(0)
  })

  it('API sem resposta: sair não espera mais que 3 s', async () => {
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    simularApi({ 'PUT /api/v1/push/aparelhos': () => ({ corpo: aparelho() }) })
    await atualizarRegistro()
    // fetch que só termina quando é cancelado
    global.fetch = jest.fn(
      (_url: unknown, opcoes?: RequestInit) =>
        new Promise<Response>((_resolver, rejeitar) => {
          opcoes?.signal?.addEventListener('abort', () => rejeitar(new Error('cancelado')))
        }),
    ) as unknown as typeof fetch
    jest.useFakeTimers()
    let terminou = false
    const saida = removerAparelho().then(() => {
      terminou = true
    })
    await jest.advanceTimersByTimeAsync(2_900)
    expect(terminou).toBe(false)
    await jest.advanceTimersByTimeAsync(200)
    await saida
    expect(terminou).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('toque na notificação', () => {
  it('a que abriu o app e as que chegam depois; cada toque uma vez; outra ação ou outro conteúdo, nada', async () => {
    n.getLastNotificationResponseAsync.mockResolvedValueOnce(
      resposta('n1', { tipo: 'alarme', alerta_id: 5, maquina_id: 1, simulado: true }),
    )
    const aoTocar = jest.fn()
    const parar = ouvirToques(aoTocar)
    await esvaziar()
    expect(aoTocar).toHaveBeenCalledWith({ tela: 'alarme', alertaId: 5, simulado: true })
    expect(n.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1)

    const ouvinte = n.addNotificationResponseReceivedListener.mock.calls[0]![0]
    ouvinte(resposta('n1', { tipo: 'alarme', alerta_id: 5, simulado: true }))
    ouvinte(resposta('n2', { tipo: 'os', os_id: 9, maquina_id: 1, simulado: false }))
    ouvinte(resposta('n3', { tipo: 'os', os_id: 9 }, 'outra-acao'))
    ouvinte(resposta('n4', { tipo: 'janela' }))
    expect(aoTocar).toHaveBeenCalledTimes(2)
    expect(aoTocar).toHaveBeenLastCalledWith({ tela: 'os', osId: 9, simulado: false })

    // as abas montam de novo (sessão destravada): o mesmo toque não abre outra vez
    n.getLastNotificationResponseAsync.mockResolvedValueOnce(resposta('n2', { tipo: 'os', os_id: 9 }))
    const parar2 = ouvirToques(aoTocar)
    await esvaziar()
    expect(aoTocar).toHaveBeenCalledTimes(2)

    parar()
    parar2()
    const assinatura = n.addNotificationResponseReceivedListener.mock.results[0]!.value as { remove: jest.Mock }
    expect(assinatura.remove).toHaveBeenCalled()
  })
})

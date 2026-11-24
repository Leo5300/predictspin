import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native'
import * as Notificacoes from 'expo-notifications'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { AppState, Linking } from 'react-native'

import { CHAVES } from '@/api/armazenamento'
import { fixarAmbienteParaTeste, obterEstadoDoPush, reiniciarPushParaTeste } from '@/api/push'
import { reiniciarSaudeParaTeste } from '@/api/saude'
import { iniciarSessao, reiniciarSessaoParaTeste } from '@/api/sessao'
import { PedidoDeNotificacao } from '@/componentes/PedidoDeNotificacao'
import { obterFonte, reiniciarPreferenciasParaTeste } from '@/estado/preferencias'
import { abrirDestino, useNotificacoes } from '@/hooks/useNotificacoes'
import { montar, simularApi } from '@/testes/ajudantes'
import { respostaLogin } from '@/testes/exemplos'

import { TelaConta } from './TelaConta'

const n = Notificacoes as jest.Mocked<typeof Notificacoes>
const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado

type Permissao = Awaited<ReturnType<typeof Notificacoes.getPermissionsAsync>>
const permissao = (p: { granted: boolean; status: string; canAskAgain: boolean }) =>
  ({ ...p, expires: 'never' }) as Permissao
const PERMITIDA = permissao({ granted: true, status: 'granted', canAskAgain: true })
const ANDROID = { expoGo: false, plataforma: 'android', projectId: 'projeto-teste' }

function api(envio = true) {
  return simularApi({
    'GET /actuator/health': () => ({ corpo: { status: 'UP' } }),
    'PUT /api/v1/push/aparelhos': () => ({
      corpo: {
        id: 1,
        plataforma: 'android',
        ativo: true,
        criado_em: '2026-11-24T10:00:00Z',
        ultimo_uso_em: '2026-11-24T10:00:00Z',
        envio_habilitado: envio,
      },
    }),
  })
}

/** Monta as abas de mentira: o gancho do push e o pedido, como no layout das abas. */
function Abas({ papel = 'TECNICO' as const }: { papel?: 'TECNICO' | 'OPERADOR' }) {
  useNotificacoes(1)
  return <PedidoDeNotificacao papel={papel} />
}

// Primeira montagem fora do prazo de cada teste: com o cache do Jest frio, ela compila os componentes do
// React Native e passa de 5 s (mesma razão do beforeAll de telas.test.tsx).
beforeAll(async () => {
  fixarAmbienteParaTeste({ ...ANDROID, expoGo: true })
  api()
  await iniciarSessao(respostaLogin('TECNICO'))
  const { unmount } = await montar(
    <>
      <Abas />
      <TelaConta />
    </>,
  )
  await unmount()
}, 120_000)

beforeEach(async () => {
  jest.clearAllMocks()
  guardado.clear()
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  reiniciarPreferenciasParaTeste()
  reiniciarPushParaTeste()
  fixarAmbienteParaTeste(ANDROID)
  n.getPermissionsAsync.mockResolvedValue(permissao({ granted: false, status: 'undetermined', canAskAgain: true }))
  n.getLastNotificationResponseAsync.mockResolvedValue(null)
  api()
  await iniciarSessao(respostaLogin('TECNICO'))
})

afterAll(() => {
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  reiniciarPushParaTeste()
})

describe('notificações na Conta', () => {
  it('Expo Go: "notificações indisponíveis neste modo", com o porquê', async () => {
    fixarAmbienteParaTeste({ ...ANDROID, expoGo: true })
    await montar(
      <>
        <Abas />
        <TelaConta />
      </>,
    )
    expect(await screen.findByText('Notificações indisponíveis neste modo.')).toBeTruthy()
    expect(screen.getByText(/O Expo Go não recebe notificações remotas/)).toBeTruthy()
    expect(screen.queryByTestId('pedido-de-notificacao')).toBeNull()
  })

  it('desligada: "Ligar notificações" abre a janela do sistema e registra este celular', async () => {
    n.requestPermissionsAsync.mockImplementationOnce(async () => {
      n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
      return PERMITIDA
    })
    await montar(
      <>
        <Abas />
        <TelaConta />
      </>,
    )
    expect(await screen.findByText('Desligadas neste celular.')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('ligar-notificacoes'))
    expect(await screen.findByText('Ligadas.')).toBeTruthy()
    expect(screen.getByText('Chegam: alarme novo, OS aberta e problema de sensor. Nunca a cada janela.')).toBeTruthy()
    expect(n.requestPermissionsAsync).toHaveBeenCalledTimes(1)
  })

  it('negada no sistema: oferece abrir as configurações', async () => {
    n.getPermissionsAsync.mockResolvedValue(permissao({ granted: false, status: 'denied', canAskAgain: false }))
    const abrir = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    await montar(
      <>
        <Abas />
        <TelaConta />
      </>,
    )
    expect(await screen.findByText('Desligadas nas configurações do celular.')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('abrir-configuracoes'))
    expect(abrir).toHaveBeenCalled()
  })

  it('API com o envio desligado: diz isso, mesmo com o celular registrado', async () => {
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    api(false)
    await montar(<Abas />)
    await waitFor(() => expect(obterEstadoDoPush().fase).toBe('registrado'))
    await montar(<TelaConta />)
    expect(screen.getByText('Este celular está registrado, mas o envio de push está desligado na API.')).toBeTruthy()
  })

  it('falha no registro: "Tentar de novo" registra outra vez', async () => {
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    n.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('sem internet'))
    await montar(
      <>
        <Abas />
        <TelaConta />
      </>,
    )
    expect(await screen.findByText('O celular não conseguiu o endereço de push.')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('tentar-notificacoes'))
    expect(await screen.findByText('Ligadas.')).toBeTruthy()
  })
})

describe('pedido depois do login', () => {
  it('nunca perguntado: uma frase do porquê; "Agora não" some e fica gravado', async () => {
    await montar(<Abas papel="OPERADOR" />)
    expect(await screen.findByText('Avisar neste celular quando houver alarme?')).toBeTruthy()
    expect(screen.getByText('Só o que pede ação: alarme novo. Nunca a cada janela.')).toBeTruthy()
    expect(n.requestPermissionsAsync).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByTestId('pedido-agora-nao'))
    await waitFor(() => expect(screen.queryByTestId('pedido-de-notificacao')).toBeNull())
    expect(guardado.get(CHAVES.notificacoes)).toBe('adiada')
  })

  it('"Permitir" abre a janela do sistema; aceita, o pedido some', async () => {
    n.requestPermissionsAsync.mockImplementationOnce(async () => {
      n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
      return PERMITIDA
    })
    await montar(<Abas />)
    await fireEvent.press(await screen.findByTestId('pedido-permitir'))
    await waitFor(() => expect(obterEstadoDoPush()).toEqual({ fase: 'registrado', envioHabilitado: true }))
    expect(screen.queryByTestId('pedido-de-notificacao')).toBeNull()
  })
})

describe('gancho das abas', () => {
  it('confere de novo quando o app volta para a frente e esquece tudo ao desmontar', async () => {
    const assinar = jest.spyOn(AppState, 'addEventListener')
    const { unmount } = await renderHook(() => useNotificacoes(1))
    await waitFor(() => expect(obterEstadoDoPush().fase).toBe('desligado'))
    // a pessoa ligou nas configurações do celular e voltou
    n.getPermissionsAsync.mockResolvedValue(PERMITIDA)
    const aoMudar = assinar.mock.calls.at(-1)![1]
    await act(async () => aoMudar('active'))
    await waitFor(() => expect(obterEstadoDoPush().fase).toBe('registrado'))
    await unmount()
    expect(obterEstadoDoPush()).toEqual({ fase: 'verificando' })
  })

  it('toque que abriu o app leva ao alarme', async () => {
    n.getLastNotificationResponseAsync.mockResolvedValueOnce({
      actionIdentifier: n.DEFAULT_ACTION_IDENTIFIER,
      notification: { request: { identifier: 'x1', content: { data: { tipo: 'alarme', alerta_id: 8, simulado: false } } } },
    } as unknown as Notificacoes.NotificationResponse)
    await renderHook(() => useNotificacoes(1))
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({ pathname: '/alarmes/[alertaId]', params: { alertaId: '8' } }),
    )
  })
})

describe('abrir o destino do toque', () => {
  it('alarme simulado: fonte Simulado e o detalhe do alarme', () => {
    abrirDestino({ tela: 'alarme', alertaId: 12, simulado: true })
    expect(obterFonte()).toBe('simulado')
    expect(router.push).toHaveBeenCalledWith({ pathname: '/alarmes/[alertaId]', params: { alertaId: '12' } })
  })

  it('OS real: fonte Real e, até a aba OS existir, a lista de alarmes', () => {
    abrirDestino({ tela: 'os', osId: 3, simulado: false })
    expect(obterFonte()).toBe('real')
    expect(router.push).toHaveBeenCalledWith('/alarmes')
  })
})

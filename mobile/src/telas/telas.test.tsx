import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'

import { definirRedeDoAparelho, reiniciarSaudeParaTeste } from '@/api/saude'
import { encerrarSessao, iniciarSessao, obterSessao, reiniciarSessaoParaTeste } from '@/api/sessao'
import type { Alarme } from '@/api/tipos'
import { definirTransporte } from '@/estado/aoVivo'
import { definirFonte, reiniciarPreferenciasParaTeste } from '@/estado/preferencias'
import { erroDaApi, montar, simularApi, type Rota } from '@/testes/ajudantes'
import {
  alarme,
  avaliada,
  detalhe,
  janela,
  LIMITES,
  MAQUINA,
  PONTOS,
  pontoDaJanela,
  respostaLogin,
  semReferencia,
} from '@/testes/exemplos'

import { proximaTentativa, TelaEntrar } from './TelaEntrar'
import { TelaAlarmes } from './TelaAlarmes'
import { TelaDetalheAlarme } from './TelaDetalheAlarme'
import { TelaMaquina } from './TelaMaquina'
import { TelaPonto } from './TelaPonto'

const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado

beforeEach(() => {
  guardado.clear()
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  reiniciarPreferenciasParaTeste()
  definirTransporte('ao_vivo')
})

afterAll(() => {
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
})

describe('tela de entrada', () => {
  async function preencherEEntrar() {
    await fireEvent.changeText(screen.getByTestId('campo-email'), 'operador@exemplo.test')
    await fireEvent.changeText(screen.getByTestId('campo-senha'), 'errada')
    await fireEvent.press(screen.getByTestId('botao-entrar'))
  }

  beforeEach(async () => {
    await encerrarSessao(null)
  })

  it('401: e-mail ou senha errados', async () => {
    simularApi({ 'POST /api/v1/auth/login': () => erroDaApi(401, 'Credenciais inválidas.') })
    await montar(<TelaEntrar />)
    await preencherEEntrar()
    expect(await screen.findByText('E-mail ou senha errados.')).toBeTruthy()
    expect(obterSessao().fase).toBe('anonima')
  })

  it('429: diz quanto esperar, pelo Retry-After', async () => {
    simularApi({
      'POST /api/v1/auth/login': () => ({ ...erroDaApi(429, 'x'), cabecalhos: { 'Retry-After': '90' } }),
    })
    await montar(<TelaEntrar />)
    await preencherEEntrar()
    expect(await screen.findByText('Muitas tentativas. Tente de novo em 1 min 30 s.')).toBeTruthy()
  })

  it('sem conexão no aparelho: mensagem clara', async () => {
    definirRedeDoAparelho(false)
    global.fetch = jest.fn(async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    await montar(<TelaEntrar />)
    await preencherEEntrar()
    expect(await screen.findByText(/Sem conexão/)).toBeTruthy()
  })

  it('servidor acordando: avisa e agenda nova tentativa', () => {
    const a = proximaTentativa(null, 0)
    expect(a).toEqual({ estado: { inicio: 0, n: 1 }, esperaMs: 2000 })
    expect(proximaTentativa(a.estado, 10_000).esperaMs).toBe(3000)
    expect(proximaTentativa(a.estado, 200_000).esperaMs).toBeNull()
  })

  it('campos vazios não chamam a API; mostrar e ocultar a senha', async () => {
    const { fetchSimulado } = simularApi({})
    await montar(<TelaEntrar />)
    await fireEvent.press(screen.getByTestId('botao-entrar'))
    expect(await screen.findByText('Preencha o e-mail e a senha.')).toBeTruthy()
    expect(fetchSimulado).not.toHaveBeenCalled()
    expect(screen.getByTestId('campo-senha').props.secureTextEntry).toBe(true)
    await fireEvent.press(screen.getByTestId('mostrar-senha'))
    expect(screen.getByTestId('campo-senha').props.secureTextEntry).toBe(false)
    expect(screen.getByLabelText('Ocultar senha')).toBeTruthy()
  })

  it('entra e mostra o aviso de sessão expirada que veio antes', async () => {
    await encerrarSessao('Sua sessão expirou. Entre novamente.')
    simularApi({ 'POST /api/v1/auth/login': () => ({ corpo: respostaLogin() }) })
    await montar(<TelaEntrar />)
    expect(screen.getByText('Sua sessão expirou. Entre novamente.')).toBeTruthy()
    await preencherEEntrar()
    await waitFor(() => expect(obterSessao().fase).toBe('autenticada'))
  })
})

function apiDaMaquina(ultima: Record<string, unknown> | null, alertas: Alarme[] = []) {
  const rotas: Record<string, Rota> = {
    'GET /api/v1/maquinas': () => ({ corpo: { conteudo: [MAQUINA], pagina: 0, tamanho: 200, total_elementos: 1, total_paginas: 1 } }),
    'GET /api/v1/maquinas/1/pontos': () => ({ corpo: { conteudo: PONTOS } }),
    'GET /api/v1/maquinas/1/serie': () => ({
      corpo: {
        pontos: ['A', 'B', 'C'],
        intervalos: [
          { janelas: 1, pontos: { A: { rms_media_g: 0.1 }, B: { rms_media_g: 0.2 }, C: { rms_media_g: 0.05 } } },
          { janelas: 0, pontos: {} },
          { janelas: 1, pontos: { A: { rms_media_g: 0.12 }, B: { rms_media_g: 0.25 }, C: { rms_media_g: 0.05 } } },
        ],
      },
    }),
    'GET /api/v1/maquinas/1/avaliacao': () => ({ corpo: { janela_id: 1001, marcha_rpm: 1120, explicacao: null, pontos: [] } }),
    'GET /api/v1/alarmes/limites': () => ({ corpo: LIMITES }),
    'GET /api/v1/alertas': () => ({ corpo: { conteudo: alertas } }),
  }
  if (ultima) rotas['GET /api/v1/maquinas/1/ultima-janela'] = () => ({ corpo: ultima })
  return simularApi(rotas)
}

function ultimaJanela(idadeS: number, simulado = false) {
  const j = janela(
    {
      A: pontoDaJanela(0.412, avaliada('alarme', 5.6), 'acionamento'),
      B: pontoDaJanela(0.2, semReferencia(), 'ferramenta'),
      C: pontoDaJanela(0.05, avaliada('normal', 0.4), 'estrutura'),
    },
    { simulado },
  )
  return { ...j, janela_id: j.id, segundos_desde_recebimento: idadeS }
}

describe('tela da máquina', () => {
  beforeEach(async () => {
    await iniciarSessao(respostaLogin())
  })

  it('ponto em alarme, sem referência e normal, com a máquina operando', async () => {
    apiDaMaquina(ultimaJanela(2))
    await montar(<TelaMaquina maquinaId={1} />)
    expect(await screen.findByTestId('placa-operando')).toBeTruthy()
    expect(screen.getByText('TORNO-01')).toBeTruthy()
    expect(await screen.findByTestId('selo-ALARME')).toBeTruthy()
    expect(screen.getByTestId('selo-SEM REFERÊNCIA')).toBeTruthy()
    expect(screen.getByTestId('selo-NORMAL')).toBeTruthy()
    expect(screen.getByText(/Grave ensaios normais e recalcule a referência/)).toBeTruthy()
    expect(screen.getByText('0,412')).toBeTruthy()
    expect(screen.getByTestId('rotacao').props.children).toBe('1118')
    expect(screen.getByLabelText('Rotação 1118 rpm, marcha 1120')).toBeTruthy()
    expect(screen.queryByTestId('aviso-velho')).toBeNull()
  })

  it('dado velho: SEM DADOS, valores apagados e "sem dados há 2 min"', async () => {
    apiDaMaquina(ultimaJanela(130))
    await montar(<TelaMaquina maquinaId={1} />)
    expect((await screen.findByTestId('aviso-velho')).props.children).toEqual(['sem dados há ', '2 min'])
    expect(screen.getByTestId('placa-sem_dados')).toBeTruthy()
    expect(screen.getAllByTestId('selo-DADO VELHO')).toHaveLength(3)
    expect(screen.queryByTestId('selo-ALARME')).toBeNull()
  })

  it('simulado: selo SIM em cada ponto', async () => {
    definirFonte('simulado')
    const { pedidos } = apiDaMaquina(ultimaJanela(1, true))
    await montar(<TelaMaquina maquinaId={1} />)
    await screen.findByTestId('placa-operando')
    expect(screen.getAllByLabelText('Dado simulado')).toHaveLength(3)
    expect(pedidos.find((p) => p.caminho.endsWith('ultima-janela'))?.url.searchParams.get('simulado')).toBe('true')
  })

  it('alerta de instrumento aparece no ponto, com a ação da API', async () => {
    apiDaMaquina(ultimaJanela(1), [
      alarme({ id: 9, tipo: 'instrumento', ponto: 'C', nivel: 'atencao', prioridade: 'baixa', acao_recomendada: 'Conferir a fixação do sensor C.' }),
    ])
    await montar(<TelaMaquina maquinaId={1} />)
    expect(await screen.findByTestId('selo-INSTRUMENTO')).toBeTruthy()
    expect(screen.getByText('Conferir a fixação do sensor C.')).toBeTruthy()
  })

  it('nenhuma janela recebida: explica e aponta a fonte', async () => {
    apiDaMaquina(null)
    await montar(<TelaMaquina maquinaId={1} />)
    expect(await screen.findByText('Nenhuma janela recebida.')).toBeTruthy()
    expect(screen.getByTestId('placa-sem_dados')).toBeTruthy()
  })

  it('detalhe do ponto: valores atuais e estado', async () => {
    apiDaMaquina(ultimaJanela(1))
    await montar(<TelaPonto maquinaId={1} codigo="A" />)
    expect(await screen.findByTestId('selo-ALARME')).toBeTruthy()
    for (const rotulo of ['RMS', 'PICO', 'CURT', '1X', '2X', '3X', 'VEL']) expect(screen.getByText(rotulo)).toBeTruthy()
    expect(screen.getByText('1,236')).toBeTruthy()
  })
})

describe('alarmes', () => {
  it('lista: em aberto primeiro, com estado em texto e o selo SIM', async () => {
    await iniciarSessao(respostaLogin())
    definirFonte('simulado')
    simularApi({
      'GET /api/v1/alertas': () => ({
        corpo: {
          conteudo: [
            alarme({ id: 1, estado: 'encerrado', simulado: true }),
            alarme({ id: 2, simulado: true }),
          ],
        },
      }),
    })
    await montar(<TelaAlarmes />)
    expect(await screen.findByTestId('linha-alarme-2')).toBeTruthy()
    expect(screen.queryByTestId('linha-alarme-1')).toBeNull()
    expect(screen.getByText('ativo, não reconhecido · prioridade alta')).toBeTruthy()
    expect(screen.getByLabelText('Dado simulado')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('filtro-todos'))
    expect(screen.getByTestId('linha-alarme-1')).toBeTruthy()
  })

  describe('detalhe e reconhecer', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('reconhecer chama a rota certa só depois de segurar 1,5 s', async () => {
      await iniciarSessao(respostaLogin('OPERADOR'))
      let estado: Alarme['estado'] = 'ativo_nao_reconhecido'
      const { pedidos } = simularApi({
        'GET /api/v1/alertas/41': () => ({ corpo: detalhe(alarme({ estado })) }),
        'POST /api/v1/alertas/41/reconhecer': () => {
          estado = 'ativo_reconhecido'
          return { corpo: alarme({ estado }) }
        },
      })
      await montar(<TelaDetalheAlarme alertaId={41} />)
      const botao = await screen.findByTestId('segurar-reconhecer')
      expect(screen.queryByTestId('botao-suprimir')).toBeNull()

      // soltar antes do fim não faz nada
      await fireEvent(botao, 'pressIn')
      await act(async () => {
        jest.advanceTimersByTime(1000)
      })
      await fireEvent(botao, 'pressOut')
      await act(async () => {
        jest.advanceTimersByTime(1000)
      })
      expect(pedidos.some((p) => p.metodo === 'POST')).toBe(false)

      await fireEvent(botao, 'pressIn')
      await act(async () => {
        jest.advanceTimersByTime(1500)
      })
      await waitFor(() =>
        expect(pedidos.filter((p) => p.metodo === 'POST').map((p) => p.caminho)).toEqual([
          '/api/v1/alertas/41/reconhecer',
        ]),
      )
      // a tela mostra o que a API respondeu
      await waitFor(() => expect(screen.getByTestId('estado-alarme').props.children).toBe('ativo, reconhecido'))
    })

    it('ADMIN vê suprimir; a segunda opinião aparece só quando a API manda', async () => {
      await iniciarSessao(respostaLogin('ADMIN'))
      simularApi({
        'GET /api/v1/alertas/41': () => ({
          corpo: detalhe(
            alarme({
              opiniao_recente: {
                anomalia: true,
                classe: 'avanco_excessivo',
                confianca: 0.78,
                concordancia: 'o modelo também vê anomalia',
                escore: 0.71,
                explicacao: 'x',
                incerta: false,
                janela_id: 1001,
                limiar: 0.6,
                medido_em: '2026-11-22T12:00:00Z',
                modelo_id: 2,
                simulado: true,
                versao: 2,
              },
            }),
          ),
        }),
        'GET /api/v1/alarmes/limites': () => ({ corpo: LIMITES }),
      })
      await montar(<TelaDetalheAlarme alertaId={41} />)
      expect(await screen.findByTestId('botao-suprimir')).toBeTruthy()
      expect(screen.getByText('avanço excessivo, 78 %')).toBeTruthy()
      expect(screen.getByText('Segunda opinião, não muda o alarme.')).toBeTruthy()
      await fireEvent.press(screen.getByTestId('botao-suprimir'))
      expect(await screen.findByText('1 h')).toBeTruthy()
      expect(screen.getByText('1 dia')).toBeTruthy()
    })

    it('sem segunda opinião, o bloco não aparece; sem conexão, reconhecer fica desligado', async () => {
      await iniciarSessao(respostaLogin('TECNICO'))
      definirRedeDoAparelho(false)
      simularApi({ 'GET /api/v1/alertas/41': () => ({ corpo: detalhe() }) })
      await montar(<TelaDetalheAlarme alertaId={41} />)
      const botao = await screen.findByTestId('segurar-reconhecer')
      expect(screen.queryByTestId('segunda-opiniao')).toBeNull()
      expect(botao.props.accessibilityState).toMatchObject({ disabled: true })
      expect(screen.getByText(/Nada é guardado para enviar depois/)).toBeTruthy()
    })
  })
})

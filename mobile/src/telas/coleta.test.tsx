import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import * as SecureStore from 'expo-secure-store'

import { reiniciarSaudeParaTeste } from '@/api/saude'
import { iniciarSessao, reiniciarSessaoParaTeste } from '@/api/sessao'
import type { Ensaio } from '@/api/tipos'
import { AvisoNoTopo } from '@/componentes/Casca'
import { dispensarAviso } from '@/estado/avisos'
import { reiniciarPreferenciasParaTeste } from '@/estado/preferencias'
import { erroDaApi, montar, simularApi, type Rota } from '@/testes/ajudantes'
import { janela, MAQUINA, pontoDaJanela, respostaLogin } from '@/testes/exemplos'

import { TelaColeta } from './TelaColeta'

const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado
const pagina = <T,>(conteudo: T[]) => ({ conteudo, pagina: 0, tamanho: 200, total_elementos: conteudo.length, total_paginas: 1 })

function ensaio(extra: Partial<Ensaio> = {}): Ensaio {
  return {
    id: 90,
    codigo: 'E-0090',
    maquina_id: 1,
    etapa: 'T1',
    condicao: 'normal',
    rotacao_alvo_rpm: 560,
    repeticao: 1,
    simulado: false,
    aberto: true,
    descartado: false,
    iniciado_em: new Date(Date.now() - 65_000).toISOString(),
    encerrado_em: null,
    material: null,
    material_item: null,
    ferramenta_item: null,
    avanco_alvo: null,
    diametro_peca_mm: null,
    fluido_corte: null,
    observacao: null,
    profundidade_corte_mm: null,
    ...extra,
  } as Ensaio
}

const COBERTURA = {
  maquina_id: 1,
  simulado: false,
  meta: 3,
  rotacoes_rpm: [560, 1120],
  origem_rotacoes: 'plano',
  combinacoes: 0,
  combinacoes_completas: 0,
  ensaios_validos: 0,
  ensaios_faltantes: 0,
  itens: [
    { etapa: 'T0', condicao: 'normal', rotacao_alvo_rpm: 0, ensaios_validos: 3, faltam: 0, uso: 'treino' },
    { etapa: 'T1', condicao: 'normal', rotacao_alvo_rpm: 560, ensaios_validos: 0, faltam: 3, uso: 'treino' },
  ],
}

/** Máquina, última janela (viva ou não), cobertura e catálogos; o resto vem de cada teste. */
function rotas(extra: Record<string, Rota>, viva: boolean): Record<string, Rota> {
  const pontos = { A: pontoDaJanela(0.1), B: pontoDaJanela(0.2), C: pontoDaJanela(0.05) }
  return {
    'GET /api/v1/maquinas': () => ({ corpo: pagina([MAQUINA]) }),
    'GET /api/v1/maquinas/1/ultima-janela': () =>
      viva
        ? {
            corpo: {
              ...janela(pontos, { rotacao_rpm: 565, medido_em: new Date().toISOString(), recebido_em: new Date().toISOString() }),
              janela_id: 1001,
            },
          }
        : { status: 404, corpo: { status: 404, mensagem: 'nenhuma janela' } },
    'GET /api/v1/maquinas/1/coleta/cobertura': () => ({ corpo: COBERTURA }),
    'GET /api/v1/materiais': () => ({ corpo: pagina([]) }),
    'GET /api/v1/ferramentas': () => ({ corpo: pagina([]) }),
    'GET /api/v1/maquinas/1/ensaios': () => ({ corpo: pagina([]) }),
    ...extra,
  }
}

// primeira montagem fora do prazo de cada teste (cache do Jest frio), como em telas.test.tsx
beforeAll(async () => {
  await iniciarSessao(respostaLogin('TECNICO'))
  simularApi(rotas({ 'GET /api/v1/maquinas/1/ensaios': () => ({ corpo: pagina([ensaio()]) }) }, true))
  const { unmount } = await montar(<TelaColeta />)
  await screen.findByTestId('coleta-gravando')
  await unmount()
}, 120_000)

beforeEach(async () => {
  guardado.clear()
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  reiniciarPreferenciasParaTeste()
  await iniciarSessao(respostaLogin('TECNICO'))
})

// o aviso some sozinho em 5 s; sem isto, o temporizador segura o Jest aberto
afterEach(() => dispensarAviso())

afterAll(() => {
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
})

describe('coleta: preparar', () => {
  it('sem dado vivo, o pré-voo bloqueia e o REC diz por quê', async () => {
    simularApi(rotas({}, false))
    await montar(<TelaColeta />)
    expect(await screen.findByTestId('coleta-preparar')).toBeTruthy()
    const rec = await screen.findByTestId('botao-rec')
    expect(rec.props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByTestId('motivo-sem-rec').props.children).toMatch(/^Ponto A: sem dado vivo/)
  })

  it('com dado vivo, começa pela próxima sugerida e o REC abre o ensaio na API', async () => {
    const { pedidos } = simularApi(
      rotas({ 'POST /api/v1/maquinas/1/ensaios': () => ({ status: 201, corpo: ensaio() }) }, true),
    )
    await montar(<TelaColeta />)
    expect(await screen.findByText(/Próxima sugerida: T1 · Normal · 560 rpm \(0 de 3\)/)).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('pre-voo-rotacao')).toBeTruthy())
    await waitFor(() =>
      expect(screen.getByTestId('botao-rec').props.accessibilityState).toMatchObject({ disabled: false }),
    )
    await fireEvent.press(screen.getByTestId('botao-rec'))
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium')
    await waitFor(() =>
      expect(pedidos.find((p) => p.metodo === 'POST')?.corpo).toEqual({
        etapa: 'T1',
        condicao: 'normal',
        rotacao_alvo_rpm: 560,
        repeticao: 1,
        simulado: false,
      }),
    )
    expect(await screen.findByTestId('coleta-gravando')).toBeTruthy()
  })

  it('a API recusa um segundo ensaio aberto: a mensagem dela aparece', async () => {
    simularApi(
      rotas(
        { 'POST /api/v1/maquinas/1/ensaios': () => erroDaApi(409, 'A máquina já tem o ensaio E-0089 aberto.') },
        true,
      ),
    )
    await montar(
      <>
        <TelaColeta />
        <AvisoNoTopo />
      </>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('botao-rec').props.accessibilityState).toMatchObject({ disabled: false }),
    )
    await fireEvent.press(screen.getByTestId('botao-rec'))
    expect(await screen.findByText(/já tem o ensaio E-0089 aberto/)).toBeTruthy()
  })

  it('no corte, a condição aparece e vai no pedido', async () => {
    simularApi(rotas({}, true))
    await montar(<TelaColeta />)
    await fireEvent.press(await screen.findByTestId('escolha-T3'))
    await fireEvent.press(screen.getByTestId('condicao-ferramenta_desgastada'))
    expect(screen.getByTestId('condicao-ferramenta_desgastada').props.accessibilityState).toMatchObject({ checked: true })
    // voltar para T1 volta a condição para normal (só o corte tem outras)
    await fireEvent.press(screen.getByTestId('escolha-T1'))
    expect(screen.queryByTestId('condicao-normal')).toBeNull()
  })
})

describe('coleta: gravando', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['Date'] }))
  afterEach(() => jest.useRealTimers())

  it('cronômetro, janelas da API, fita com saturada; marcar evento e encerrar com carimbo', async () => {
    let aberto = true
    const { pedidos } = simularApi(
      rotas(
        {
          'GET /api/v1/maquinas/1/ensaios': () => ({ corpo: pagina(aberto ? [ensaio()] : []) }),
          'GET /api/v1/ensaios/90/resumo': () => ({
            corpo: { ensaio_id: 90, janelas: 13, janelas_saturadas: 1, duracao_segundos: 65 },
          }),
          'GET /api/v1/ensaios/90/janelas': () => ({
            corpo: pagina([
              { ...janela({}), id: 1, saturou: false },
              { ...janela({}), id: 2, saturou: true },
            ]),
          }),
          'POST /api/v1/ensaios/90/eventos': () => ({ status: 201, corpo: { id: 1 } }),
          'POST /api/v1/ensaios/90/encerrar': () => {
            aberto = false
            return { corpo: ensaio({ aberto: false }) }
          },
        },
        true,
      ),
    )
    await montar(<TelaColeta />)
    expect(await screen.findByTestId('coleta-gravando')).toBeTruthy()
    expect(screen.getByTestId('cronometro').props.children).toMatch(/^01:0\d$/)
    await waitFor(() => expect(screen.getByTestId('contador-janelas').props.children).toEqual(['13 janelas', ' · 1 saturadas']))
    expect(screen.getAllByTestId('traco')).toHaveLength(1)
    expect(screen.getAllByTestId('traco-saturado')).toHaveLength(1)

    await fireEvent.press(screen.getByTestId('marcar-evento'))
    await fireEvent.press(screen.getByTestId('motivo-cavaco'))
    await waitFor(() => {
      const evento = pedidos.find((p) => p.caminho.endsWith('/eventos'))
      expect(evento?.corpo).toMatchObject({ motivo: 'cavaco', ocorrido_em: expect.any(String) })
    })

    await fireEvent(screen.getByTestId('segurar-encerrar'), 'pressIn')
    await act(async () => {
      jest.advanceTimersByTime(1500)
    })
    await waitFor(() => expect(pedidos.some((p) => p.caminho.endsWith('/encerrar'))).toBe(true))
    expect(await screen.findByTestId('coleta-preparar')).toBeTruthy()
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light')
    expect(await screen.findByTestId('carimbo')).toBeTruthy()
  })
})

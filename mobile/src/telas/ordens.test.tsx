import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { Alert } from 'react-native'

import { reiniciarSaudeParaTeste } from '@/api/saude'
import { iniciarSessao, reiniciarSessaoParaTeste } from '@/api/sessao'
import type { OrdemServico } from '@/api/tipos'
import { reiniciarPreferenciasParaTeste } from '@/estado/preferencias'
import { montar, simularApi } from '@/testes/ajudantes'
import { alarme, detalhe, LIMITES, ordem, respostaLogin } from '@/testes/exemplos'

import { TelaDetalheOrdem } from './TelaDetalheOrdem'
import { TelaOrdens } from './TelaOrdens'

const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado

const pagina = (conteudo: OrdemServico[]) => ({
  conteudo,
  pagina: 0,
  tamanho: 100,
  total_elementos: conteudo.length,
  total_paginas: 1,
})

/** Rotas que o detalhe sempre lê, além da própria OS. */
const ROTAS_DO_DETALHE = {
  'GET /api/v1/alertas/41': () => ({ corpo: detalhe(alarme()) }),
  'GET /api/v1/alarmes/limites': () => ({ corpo: LIMITES }),
  'GET /api/v1/maquinas/1/avaliacao': () => ({ status: 404, corpo: { status: 404, mensagem: 'sem janela' } }),
  'GET /api/v1/maquinas/1/janelas': () => ({ corpo: { ...pagina([]), conteudo: [] } }),
}

// primeira montagem fora do prazo de cada teste (cache do Jest frio), como em telas.test.tsx
beforeAll(async () => {
  await iniciarSessao(respostaLogin('ADMIN'))
  simularApi({
    ...ROTAS_DO_DETALHE,
    'GET /api/v1/ordens-servico': () => ({ corpo: pagina([ordem()]) }),
    'GET /api/v1/ordens-servico/7': () => ({ corpo: ordem() }),
  })
  const lista = await montar(<TelaOrdens />)
  await screen.findByTestId('linha-os-7')
  await lista.unmount()
  const tela = await montar(<TelaDetalheOrdem osId={7} />)
  await fireEvent.press(await screen.findByTestId('botao-concluir'))
  await tela.unmount()
}, 120_000)

beforeEach(() => {
  guardado.clear()
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  reiniciarPreferenciasParaTeste()
})

afterAll(() => {
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
})

describe('lista de OS', () => {
  it('abertas sem dono primeiro, com quem assumiu e o selo SIM; o filtro vai para a API', async () => {
    await iniciarSessao(respostaLogin('OPERADOR'))
    const { pedidos } = simularApi({
      'GET /api/v1/ordens-servico': () => ({
        corpo: pagina([
          ordem({ id: 1, status: 'em_andamento', responsavel: 'Ana' }),
          ordem({ id: 2 }),
          ordem({ id: 3, status: 'concluida', responsavel: 'Ana' }),
        ]),
      }),
    })
    await montar(<TelaOrdens />)
    const linhas = await screen.findAllByTestId(/^linha-os-/)
    expect(linhas.map((l) => l.props.testID)).toEqual(['linha-os-2', 'linha-os-1', 'linha-os-3'])
    expect(screen.getByText('ninguém assumiu')).toBeTruthy()
    expect(screen.getAllByText('com Ana')).toHaveLength(2)
    expect(pedidos[0]!.url.searchParams.get('simulado')).toBe('false')
    expect(pedidos[0]!.url.searchParams.has('status')).toBe(false)

    await fireEvent.press(screen.getByTestId('escolha-concluida'))
    await waitFor(() => expect(pedidos.at(-1)!.url.searchParams.get('status')).toBe('concluida'))
  })

  it('vazia: diz quando a API abre uma OS', async () => {
    await iniciarSessao(respostaLogin('TECNICO'))
    simularApi({ 'GET /api/v1/ordens-servico': () => ({ corpo: pagina([]) }) })
    await montar(<TelaOrdens />)
    expect(await screen.findByText('Nenhuma OS aqui.')).toBeTruthy()
  })
})

describe('detalhe da OS', () => {
  it('operador só vê: sem assumir nem concluir, com o porquê', async () => {
    await iniciarSessao(respostaLogin('OPERADOR'))
    simularApi({ ...ROTAS_DO_DETALHE, 'GET /api/v1/ordens-servico/7': () => ({ corpo: ordem() }) })
    await montar(<TelaDetalheOrdem osId={7} />)
    expect(await screen.findByText('Ninguém assumiu ainda.')).toBeTruthy()
    expect(screen.queryByTestId('botao-assumir')).toBeNull()
    expect(screen.getByText('Assumir e concluir: técnico ou administrador.')).toBeTruthy()
    // alarme de origem lido da API
    expect(await screen.findByText('Abrir o alarme')).toBeTruthy()
  })

  it('segunda opinião na abertura e a mais recente, com "não muda a OS"', async () => {
    await iniciarSessao(respostaLogin('TECNICO'))
    const opiniao = {
      anomalia: true,
      classe: 'avanco_excessivo',
      confianca: 0.8,
      escore: 0.7,
      limiar: 0.5,
      versao: 3,
      simulado: true,
    }
    simularApi({
      ...ROTAS_DO_DETALHE,
      'GET /api/v1/ordens-servico/7': () => ({
        corpo: ordem({ opiniao_abertura: opiniao, opiniao_recente: { ...opiniao, versao: 4 } } as Partial<OrdemServico>),
      }),
    })
    await montar(<TelaDetalheOrdem osId={7} />)
    expect(await screen.findByTestId('segunda-opiniao-os')).toBeTruthy()
    expect(screen.getByText('Na abertura')).toBeTruthy()
    expect(screen.getByText('Mais recente')).toBeTruthy()
    expect(screen.getByText('Segunda opinião, não muda a OS.')).toBeTruthy()
  })

  describe('assumir e concluir', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('assumir pede confirmação; a tela mostra o que a API respondeu', async () => {
      await iniciarSessao(respostaLogin('TECNICO'))
      const confirmar = jest.spyOn(Alert, 'alert')
      const { pedidos } = simularApi({
        ...ROTAS_DO_DETALHE,
        'GET /api/v1/ordens-servico/7': () => ({ corpo: ordem() }),
        'POST /api/v1/ordens-servico/7/assumir': () => ({
          corpo: ordem({ status: 'em_andamento', responsavel: 'Técnico Teste', assumida_em: '2026-11-24T10:05:00Z' }),
        }),
      })
      await montar(<TelaDetalheOrdem osId={7} />)
      await fireEvent.press(await screen.findByTestId('botao-assumir'))
      expect(pedidos.some((p) => p.metodo === 'POST')).toBe(false)
      const botoes = confirmar.mock.calls[0]![2]!
      await act(async () => botoes.find((b) => b.text === 'Assumir')!.onPress!())
      await waitFor(() => expect(screen.getByTestId('status-os').props.children).toBe('EM ANDAMENTO'))
      expect(screen.getByTestId('responsavel-os').props.children).toBe('Assumida por Técnico Teste')
    })

    it('concluir: sem o retorno não segura; com ele, manda retorno, condição e observação', async () => {
      await iniciarSessao(respostaLogin('ADMIN'))
      const { pedidos } = simularApi({
        ...ROTAS_DO_DETALHE,
        'GET /api/v1/ordens-servico/7': () => ({ corpo: ordem({ status: 'em_andamento', responsavel: 'Ana' }) }),
        'POST /api/v1/ordens-servico/7/concluir': ({ corpo }) => ({
          corpo: ordem({
            status: 'concluida',
            responsavel: 'Ana',
            retorno_tecnico: (corpo as { retorno: 'confirmada' }).retorno,
            condicao_encontrada: 'ferramenta_desgastada',
          }),
        }),
      })
      await montar(<TelaDetalheOrdem osId={7} />)
      await fireEvent.press(await screen.findByTestId('botao-concluir'))
      expect(screen.getByText(/Sua resposta ensina o modelo/)).toBeTruthy()
      expect(screen.getByTestId('segurar-concluir').props.accessibilityState).toMatchObject({ disabled: true })

      // as opções vêm do contrato (enumeracoes.ts gerado)
      await fireEvent.press(screen.getByTestId('escolha-confirmada'))
      await fireEvent.press(screen.getByTestId('condicao-ferramenta_desgastada'))
      await fireEvent.changeText(screen.getByTestId('campo-observacao'), '  pastilha lascada  ')
      const segurar = screen.getByTestId('segurar-concluir')
      await fireEvent(segurar, 'pressIn')
      await act(async () => {
        jest.advanceTimersByTime(1500)
      })
      await waitFor(() =>
        expect(pedidos.find((p) => p.metodo === 'POST')?.corpo).toEqual({
          retorno: 'confirmada',
          condicao_encontrada: 'ferramenta_desgastada',
          comentario: 'pastilha lascada',
        }),
      )
      await waitFor(() => expect(screen.getByTestId('status-os').props.children).toBe('CONCLUÍDA'))
      expect(screen.getByText('Havia problema')).toBeTruthy()
    })
  })
})

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

import { reiniciarSaudeParaTeste } from '@/api/saude'
import { iniciarSessao, reiniciarSessaoParaTeste } from '@/api/sessao'
import type { ModeloDetalhe, ModeloResumo } from '@/api/tipos'
import { AvisoNoTopo } from '@/componentes/Casca'
import { AVISO_DA_VALIDACAO } from '@/dominio/modelos'
import { dispensarAviso } from '@/estado/avisos'
import { reiniciarPreferenciasParaTeste } from '@/estado/preferencias'
import { montar, simularApi } from '@/testes/ajudantes'
import { MAQUINA, respostaLogin } from '@/testes/exemplos'

import { TelaConta } from './TelaConta'
import { TelaDetalheModelo, TelaModelos } from './TelaModelos'

const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado
const pagina = <T,>(conteudo: T[]) => ({
  conteudo,
  pagina: 0,
  tamanho: 50,
  total_elementos: conteudo.length,
  total_paginas: 1,
})

function resumo(extra: Partial<ModeloResumo> = {}): ModeloResumo {
  return {
    id: 5,
    versao: 5,
    maquina_id: 1,
    estado: 'candidato',
    simulado: false,
    criado_em: '2026-11-20T10:00:00Z',
    criado_por: 'Ana',
    ativado_em: null,
    ativado_por: null,
    classes: ['normal', 'avanco_excessivo'],
    f1_macro_por_ensaio: 0.81,
    limiar_anomalia: 0.42,
    referencia_numero: 2,
    tamanho_bytes: 1000,
    trabalho_id: null,
    versao_vetor: '1',
    aviso_simulado: null,
    ...extra,
  } as ModeloResumo
}

const VALIDACAO = {
  aplicavel: true,
  k: 5,
  dias: null,
  janelas_testadas: 300,
  motivo: null,
  classificador: {
    classes: ['normal', 'avanco_excessivo'],
    f1_macro: 0.81,
    janelas: 300,
    matriz_confusao: [
      [140, 10],
      [20, 130],
    ],
    recall: { normal: 0.933, avanco_excessivo: 0.867 },
  },
  comparacao: {
    regra: { falso_positivo: 0.05, deteccao: 0.7, janelas_normais: 150, janelas_nao_normais: 150 },
    isolation_forest: { falso_positivo: 0.08, deteccao: 0.82, janelas_normais: 150, janelas_nao_normais: 150 },
  },
}

function detalhe(modelo: ModeloResumo): ModeloDetalhe {
  return {
    modelo,
    caminho: 'java',
    avisos: ['A referência mudou depois do treino.'],
    metadados: {
      limiar_anomalia: 0.42,
      referencia_numero: 2,
      caracteristicas: ['a', 'b'],
      classes_fora: [],
      metricas: {
        if_percentil: 99,
        limiar_anomalia: 0.42,
        por_ensaio: VALIDACAO,
        por_dia: { aplicavel: false, motivo: 'menos de 2 dias de coleta' },
      },
    },
  } as unknown as ModeloDetalhe
}

const MAQUINAS = { 'GET /api/v1/maquinas': () => ({ corpo: { ...pagina([MAQUINA]), tamanho: 200 } }) }

// primeira montagem fora do prazo de cada teste (cache do Jest frio), como em telas.test.tsx
beforeAll(async () => {
  await iniciarSessao(respostaLogin('ADMIN'))
  simularApi({
    ...MAQUINAS,
    'GET /api/v1/maquinas/1/modelos': () => ({ corpo: pagina([resumo()]) }),
    'GET /api/v1/modelos/5': () => ({ corpo: detalhe(resumo()) }),
  })
  const lista = await montar(<TelaModelos />)
  await screen.findByTestId('linha-modelo-5')
  await lista.unmount()
  const tela = await montar(<TelaDetalheModelo modeloId={5} />)
  await screen.findByTestId('detalhe-modelo')
  await tela.unmount()
}, 120_000)

beforeEach(() => {
  guardado.clear()
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  reiniciarPreferenciasParaTeste()
})

afterEach(() => dispensarAviso())

afterAll(() => {
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
})

describe('modelos na Conta', () => {
  it('só ADMIN vê o atalho para os modelos', async () => {
    simularApi({ 'GET /actuator/health': () => ({ corpo: { status: 'UP' } }) })
    await iniciarSessao(respostaLogin('TECNICO'))
    const tecnico = await montar(<TelaConta />)
    expect(screen.queryByTestId('abrir-modelos')).toBeNull()
    await tecnico.unmount()
    await iniciarSessao(respostaLogin('ADMIN'))
    await montar(<TelaConta />)
    await fireEvent.press(screen.getByTestId('abrir-modelos'))
    expect(router.push).toHaveBeenCalledWith('/conta/modelos')
  })

  it('lista: ativa primeiro, com quem treinou e quem ativou', async () => {
    await iniciarSessao(respostaLogin('ADMIN'))
    simularApi({
      ...MAQUINAS,
      'GET /api/v1/maquinas/1/modelos': () => ({
        corpo: pagina([
          resumo(),
          resumo({ id: 4, versao: 4, estado: 'ativo', ativado_por: 'Bia', ativado_em: '2026-11-21T09:00:00Z' }),
          resumo({ id: 3, versao: 3, estado: 'arquivado', criado_por: null, f1_macro_por_ensaio: null, classes: [] }),
        ]),
      }),
    })
    await montar(<TelaModelos />)
    const linhas = await screen.findAllByTestId(/^linha-modelo-/)
    expect(linhas.map((l) => l.props.testID)).toEqual(['linha-modelo-4', 'linha-modelo-5', 'linha-modelo-3'])
    expect(screen.getByText(/^ativada por Bia em/)).toBeTruthy()
    expect(screen.getByText(/^treinada por serviço de treino/)).toBeTruthy()
    expect(screen.getByText('só anomalia, sem classificador')).toBeTruthy()
  })
})

describe('detalhe do modelo', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['Date'] }))
  afterEach(() => jest.useRealTimers())

  it('aviso acima das métricas; validação sem métricas diz por quê; ativar segurando com a consequência', async () => {
    await iniciarSessao(respostaLogin('ADMIN'))
    const { pedidos } = simularApi({
      'GET /api/v1/modelos/5': () => ({ corpo: detalhe(resumo()) }),
      'GET /api/v1/maquinas/1/modelos': () => ({
        corpo: pagina([resumo(), resumo({ id: 4, versao: 4, estado: 'ativo' })]),
      }),
      'POST /api/v1/modelos/5/ativar': () => ({ corpo: detalhe(resumo({ estado: 'ativo', ativado_por: 'Admin' })) }),
    })
    await montar(
      <>
        <TelaDetalheModelo modeloId={5} />
        <AvisoNoTopo />
      </>,
    )
    expect(await screen.findByText(AVISO_DA_VALIDACAO)).toBeTruthy()
    expect(screen.getByText('A referência mudou depois do treino.')).toBeTruthy()
    expect(screen.getByText('menos de 2 dias de coleta')).toBeTruthy()
    expect(screen.getByText('Recall por classe')).toBeTruthy()

    await fireEvent.press(screen.getByTestId('botao-ativar'))
    await waitFor(() =>
      expect(screen.getByTestId('consequencia').props.children).toMatch(/A versão 4, ativa hoje, vira arquivada/),
    )
    await fireEvent(screen.getByTestId('segurar-ativar'), 'pressIn')
    await act(async () => {
      jest.advanceTimersByTime(1500)
    })
    await waitFor(() => expect(pedidos.some((p) => p.caminho === '/api/v1/modelos/5/ativar')).toBe(true))
    await waitFor(() => expect(screen.getByTestId('estado-modelo').props.children).toBe('ATIVA'))
    expect(screen.queryByTestId('botao-ativar')).toBeNull()
  })

  it('técnico que chegue ao detalhe não vê ativar', async () => {
    await iniciarSessao(respostaLogin('TECNICO'))
    simularApi({
      'GET /api/v1/modelos/5': () => ({ corpo: detalhe(resumo()) }),
      'GET /api/v1/maquinas/1/modelos': () => ({ corpo: pagina([resumo()]) }),
    })
    await montar(<TelaDetalheModelo modeloId={5} />)
    expect(await screen.findByTestId('detalhe-modelo')).toBeTruthy()
    expect(screen.queryByTestId('botao-ativar')).toBeNull()
  })
})

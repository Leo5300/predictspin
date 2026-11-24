import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { Avaliacao, Limites } from '@/api/tipos'
import { tendenciaDeJanelas, type JanelaDaTendencia } from '@/dominio/tendencia'
import { montar as montarNaTela, simularApi } from '@/testes/ajudantes'
import { LIMITES } from '@/testes/exemplos'

import { GraficoTendencia } from './GraficoTendencia'
import { TendenciaDoPonto } from './TendenciaDoPonto'

const T0 = Date.parse('2026-11-24T10:00:00Z') / 1000
const janela = (s: number, rms: number, z?: number): JanelaDaTendencia => ({
  medido_em: new Date((T0 + s) * 1000).toISOString(),
  modo: 'normal',
  pontos: { B: { rms_g: rms, ...(z === undefined ? {} : { avaliacao: { z: { rms_g: z } } }) } },
})
// o desenho fica fora do leitor de tela (o resumo está na área do gráfico)
const OCULTO = { includeHiddenElements: true }
const LIMITES_Z = { z_atencao: 3, z_alarme: 6 }
const FAIXA = { centro: 0.2, inferior: 0.17, atencao: 0.23, alarme: 0.26 }

async function montar(janelas: JanelaDaTendencia[], faixa = FAIXA as typeof FAIXA | null) {
  const resultado = await render(
    <GraficoTendencia
      tendencia={tendenciaDeJanelas(janelas, 'B')}
      inicioS={T0}
      fimS={T0 + 60}
      faixa={faixa}
      limitesZ={LIMITES_Z}
      descricao="Tendência do RMS do ponto B, últimos 15 min"
    />,
  )
  // a largura só existe depois do layout
  await act(async () => {
    fireEvent(screen.getByTestId('caixa-do-grafico'), 'layout', {
      nativeEvent: { layout: { width: 344, height: 180, x: 0, y: 0 } },
    })
  })
  return resultado
}

// primeira montagem fora do prazo de cada teste (cache do Jest frio), como em telas.test.tsx
beforeAll(async () => {
  await montar([janela(0, 0.2)])
}, 120_000)

describe('gráfico de tendência', () => {
  it('buraco de dado quebra a linha em dois trechos; faixa e limites desenhados', async () => {
    await montar([janela(0, 0.2), janela(5, 0.21), janela(30, 0.22), janela(35, 0.2)])
    expect(screen.getAllByTestId('trecho-tendencia', OCULTO)).toHaveLength(2)
    expect(screen.getByTestId('faixa-normal', OCULTO)).toBeTruthy()
    expect(screen.getByTestId('limite-atencao', OCULTO)).toBeTruthy()
    expect(screen.getByTestId('limite-alarme', OCULTO)).toBeTruthy()
  })

  it('cor só no desvio: ▲ atenção e ◆ alarme pelo z da API', async () => {
    await montar([janela(0, 0.2, 1), janela(5, 0.24, 3.5), janela(10, 0.3, 7)])
    expect(screen.getAllByTestId('marca-atencao', OCULTO)).toHaveLength(1)
    expect(screen.getAllByTestId('marca-alarme', OCULTO)).toHaveLength(1)
  })

  it('sem referência: sem faixa nem linhas de limite', async () => {
    await montar([janela(0, 0.2), janela(5, 0.2)], null)
    expect(screen.queryByTestId('faixa-normal', OCULTO)).toBeNull()
    expect(screen.queryByTestId('limite-atencao', OCULTO)).toBeNull()
  })

  it('arrastar mostra o valor e a hora da amostra mais perto', async () => {
    await montar([janela(0, 0.2), janela(5, 0.21, 1.2), janela(10, 0.22)])
    expect(screen.getByTestId('leitura-tendencia').props.children).toMatch(/^último .* · 0,220 g$/)
    // largura útil 290 px para 60 s: x = 44 + 5/60 × 290 ≈ 68
    await act(async () => {
      fireEvent(screen.getByTestId('area-do-grafico'), 'responderGrant', { nativeEvent: { locationX: 68 } })
    })
    expect(screen.getByTestId('leitura-tendencia').props.children).toMatch(/ · 0,210 g · z 1,2$/)
  })

  it('leitor de tela: resumo no rótulo e deslizar anda pelas amostras', async () => {
    await montar([janela(0, 0.2), janela(5, 0.3, 7)])
    const area = screen.getByTestId('area-do-grafico')
    expect(area.props.accessibilityLabel).toContain('1 em alarme')
    await act(async () => {
      fireEvent(area, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    })
    expect(screen.getByTestId('leitura-tendencia').props.children).toMatch(/ · 0,200 g$/)
    await act(async () => {
      fireEvent(area, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    })
    expect(screen.getByTestId('leitura-tendencia').props.children).toMatch(/ · 0,300 g/)
    await act(async () => {
      fireEvent(area, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
    })
    expect(screen.getByTestId('leitura-tendencia').props.children).toMatch(/ · 0,200 g$/)
  })

  it('período sem janelas diz isso, sem linha', async () => {
    await montar([])
    expect(screen.getByText('Sem janelas no período.')).toBeTruthy()
    expect(screen.queryByTestId('trecho-tendencia', OCULTO)).toBeNull()
  })
})

describe('tendência do ponto (bloco da tela)', () => {
  const avaliacao = {
    maquina_id: 1,
    janela_id: 1,
    marcha_rpm: 1120,
    pontos: [
      {
        ponto: 'B',
        etapa_ref: 'T1',
        medidas: [{ medida: 'rms_g', valor: 0.21, tipico: 0.2, z: 1, diferenca_pct: 5, sigma_efetivo: 0.01 }],
      },
    ],
  } as unknown as Avaliacao

  it('faixa da referência com marcha e etapa na legenda; 24 h pede a série agregada', async () => {
    const { pedidos } = simularApi({
      'GET /api/v1/maquinas/1/janelas': () => ({
        corpo: { conteudo: [], pagina: 0, tamanho: 200, total_elementos: 0, total_paginas: 0 },
      }),
      'GET /api/v1/maquinas/1/serie': () => ({
        corpo: { segundos_por_balde: 150, intervalos: [], baldes: 576, pontos: [], maquina_id: 1 },
      }),
    })
    await montarNaTela(
      <TendenciaDoPonto maquinaId={1} codigo="B" simulado={false} avaliacao={avaliacao} limites={LIMITES as Limites} />,
    )
    expect(await screen.findByText(/referência em uso agora \(marcha 1120 rpm, T1\)/)).toBeTruthy()
    expect(await screen.findByTestId('grafico-tendencia')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('escolha-24h'))
    expect(await screen.findByText(/cada traço é a média de um intervalo/)).toBeTruthy()
    await waitFor(() => expect(pedidos.some((p) => p.caminho.endsWith('/serie'))).toBe(true))
  })

  it('sem σ na avaliação: diz que não há faixa', async () => {
    simularApi({
      'GET /api/v1/maquinas/1/janelas': () => ({
        corpo: { conteudo: [], pagina: 0, tamanho: 200, total_elementos: 0, total_paginas: 0 },
      }),
    })
    await montarNaTela(
      <TendenciaDoPonto maquinaId={1} codigo="B" simulado={false} avaliacao={undefined} limites={LIMITES as Limites} />,
    )
    expect(await screen.findByText(/Sem referência para este ponto agora/)).toBeTruthy()
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ErroApi } from '@/api/erros'
import type { EstadoDemo } from '@/api/demonstracao'

const mocks = vi.hoisted(() => ({
  estado: { current: null as EstadoDemo | null },
  consultas: { current: 0 },
  trocar: { current: null as unknown as (nivel: string) => Promise<unknown> },
}))

vi.mock('@/api/demonstracao', async () => {
  const { queryOptions } = await import('@tanstack/react-query')
  return {
    chaveDoEstadoDemo: ['demo', 'estado'],
    consultaEstadoDemo: () =>
      queryOptions({
        queryKey: ['demo', 'estado'],
        queryFn: () => {
          mocks.consultas.current += 1
          return Promise.resolve(mocks.estado.current)
        },
        retry: false,
      }),
    trocarCenario: (nivel: string) => mocks.trocar.current(nivel),
  }
})

import { BarraDeDemonstracao } from './BarraDeDemonstracao'

function estadoDa(parte: Partial<EstadoDemo> = {}): EstadoDemo {
  return {
    habilitado: true,
    nivel: 'PARADA',
    volta_normal_em_s: null,
    referencia_ok: true,
    hardware_real_ativo: false,
    mensagem: 'Demonstração parada: nenhuma janela simulada está sendo gerada.',
    ...parte,
  }
}

function montar(papel: 'ADMIN' | 'TECNICO' | 'OPERADOR' = 'ADMIN') {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={cliente}>
      <BarraDeDemonstracao papel={papel} />
      <input aria-label="Campo de teste" />
    </QueryClientProvider>,
  )
}

const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome })

beforeEach(() => {
  mocks.estado.current = estadoDa()
  mocks.consultas.current = 0
  mocks.trocar.current = vi.fn((nivel: string) =>
    Promise.resolve(estadoDa({ nivel: nivel as EstadoDemo['nivel'] })),
  )
  localStorage.clear()
})

describe('BarraDeDemonstracao: permissão e presença', () => {
  it('aparece para ADMIN quando a demonstração está ligada', async () => {
    montar('ADMIN')
    expect(await screen.findByText(/Demonstração · dados simulados/)).toBeInTheDocument()
    expect(botao(/^NORMAL/)).toBeInTheDocument()
    expect(botao(/^ATENÇÃO/)).toBeInTheDocument()
    expect(botao(/^ALARME/)).toBeInTheDocument()
    expect(botao(/^Parar/)).toBeInTheDocument()
  })

  it.each(['TECNICO', 'OPERADOR'] as const)(
    'não aparece para %s e nem pergunta à API',
    async (papel) => {
      montar(papel)
      await act(async () => {
        await Promise.resolve()
      })
      expect(screen.queryByTestId('barra-demonstracao')).toBeNull()
      expect(mocks.consultas.current).toBe(0)
    },
  )

  it('não aparece quando a API diz que a demonstração está desligada', async () => {
    mocks.estado.current = null
    montar('ADMIN')
    await waitFor(() => expect(mocks.consultas.current).toBe(1))
    expect(screen.queryByTestId('barra-demonstracao')).toBeNull()
  })
})

describe('BarraDeDemonstracao: estado vem da resposta da API', () => {
  it('marca só o botão do nível que a API informou, com aria-pressed', async () => {
    mocks.estado.current = estadoDa({
      nivel: 'ALARME',
      volta_normal_em_s: 300,
      mensagem: 'ALARME simulado.',
    })
    montar()
    await screen.findByTestId('barra-demonstracao')
    expect(botao(/^ALARME/)).toHaveAttribute('aria-pressed', 'true')
    expect(botao(/^ATENÇÃO/)).toHaveAttribute('aria-pressed', 'false')
    expect(botao(/^NORMAL/)).toHaveAttribute('aria-pressed', 'false')
    expect(botao(/^Parar/)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('nivel-atual')).toHaveTextContent('Nível atual: ALARME')
    expect(screen.getByTestId('mensagem-demonstracao')).toHaveTextContent('ALARME simulado.')
  })

  it('mostra "volta ao normal em mm:ss" em ATENÇÃO e ALARME, e não em NORMAL nem parada', async () => {
    mocks.estado.current = estadoDa({ nivel: 'ATENCAO', volta_normal_em_s: 300 })
    const { unmount } = montar()
    expect(await screen.findByTestId('contagem-demonstracao')).toHaveTextContent(
      'volta ao normal em 05:00',
    )
    unmount()

    mocks.estado.current = estadoDa({ nivel: 'NORMAL', volta_normal_em_s: null })
    montar()
    await screen.findByTestId('barra-demonstracao')
    expect(screen.queryByTestId('contagem-demonstracao')).toBeNull()
  })

  it('clicar chama a API com o nível, mostra "aplicando" e só marca quando a resposta chega', async () => {
    let resolver: (e: EstadoDemo) => void = () => undefined
    mocks.trocar.current = vi.fn(
      () =>
        new Promise<EstadoDemo>((resolve) => {
          resolver = resolve
        }),
    )
    montar()
    await screen.findByTestId('barra-demonstracao')

    fireEvent.click(botao(/^ATENÇÃO/))
    await waitFor(() => expect(mocks.trocar.current).toHaveBeenCalledWith('ATENCAO'))
    // pedido feito, resposta ainda não: nada marcado, o botão avisa que está aplicando
    expect(botao(/^ATENÇÃO/)).toHaveAttribute('aria-busy', 'true')
    expect(botao(/^ATENÇÃO/)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('aplicando')).toBeInTheDocument()

    act(() => {
      resolver(
        estadoDa({ nivel: 'ATENCAO', volta_normal_em_s: 300, mensagem: 'A sobe mais que B e C.' }),
      )
    })
    await waitFor(() => expect(botao(/^ATENÇÃO/)).toHaveAttribute('aria-pressed', 'true'))
    expect(botao(/^ATENÇÃO/)).not.toHaveAttribute('aria-busy')
    expect(screen.getByTestId('mensagem-demonstracao')).toHaveTextContent('A sobe mais que B e C.')
  })

  it('enquanto um pedido está em andamento, outro clique não dispara nova chamada', async () => {
    mocks.trocar.current = vi.fn(() => new Promise<EstadoDemo>(() => undefined))
    montar()
    await screen.findByTestId('barra-demonstracao')
    fireEvent.click(botao(/^ALARME/))
    fireEvent.click(botao(/^NORMAL/))
    fireEvent.keyDown(window, { key: '2' })
    await waitFor(() => expect(mocks.trocar.current).toHaveBeenCalledTimes(1))
  })

  it('se a API devolver outro nível que o pedido, vale o da API (nunca um estado inventado)', async () => {
    mocks.trocar.current = vi.fn(() =>
      Promise.resolve(
        estadoDa({
          nivel: 'PARADA',
          referencia_ok: false,
          mensagem: 'Sem referência simulada ativa.',
        }),
      ),
    )
    montar()
    await screen.findByTestId('barra-demonstracao')
    fireEvent.click(botao(/^ALARME/))
    await waitFor(() => expect(mocks.trocar.current).toHaveBeenCalled())
    await waitFor(() => expect(botao(/^Parar/)).toHaveAttribute('aria-pressed', 'true'))
    expect(botao(/^ALARME/)).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByText(/Sem referência ativa para a marcha da demonstração/),
    ).toBeInTheDocument()
  })

  it('erro da API vira aviso em português e a barra continua no nível de antes', async () => {
    mocks.estado.current = estadoDa({ nivel: 'NORMAL' })
    mocks.trocar.current = vi.fn(() =>
      Promise.reject(new ErroApi(500, { mensagem: 'Erro interno. Tente de novo.' })),
    )
    montar()
    await screen.findByTestId('barra-demonstracao')
    fireEvent.click(botao(/^ALARME/))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não consegui trocar o nível: Erro interno. Tente de novo.')
    expect(botao(/^NORMAL/)).toHaveAttribute('aria-pressed', 'true')
    expect(botao(/^ALARME/)).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('BarraDeDemonstracao: avisos', () => {
  it('sem referência: avisa em texto simples e esconde a mensagem comum', async () => {
    mocks.estado.current = estadoDa({ referencia_ok: false, mensagem: 'Falta a referência.' })
    montar()
    await screen.findByTestId('barra-demonstracao')
    expect(
      screen.getByText(/Sem referência ativa para a marcha da demonstração: nenhum dado é gerado/),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('mensagem-demonstracao')).toBeNull()
  })

  it('hardware real enviando: avisa que a demonstração está em pausa', async () => {
    mocks.estado.current = estadoDa({
      nivel: 'ALARME',
      volta_normal_em_s: 120,
      hardware_real_ativo: true,
    })
    montar()
    await screen.findByTestId('barra-demonstracao')
    expect(
      screen.getByText(/Hardware real enviando: a demonstração está em pausa/),
    ).toBeInTheDocument()
  })
})

describe('BarraDeDemonstracao: teclado', () => {
  it('1, 2, 3 e 0 pedem Normal, Atenção, Alarme e Parar', async () => {
    montar()
    await screen.findByTestId('barra-demonstracao')
    for (const [tecla, nivel] of [
      ['1', 'NORMAL'],
      ['2', 'ATENCAO'],
      ['3', 'ALARME'],
      ['0', 'PARADA'],
    ] as const) {
      fireEvent.keyDown(window, { key: tecla })
      await waitFor(() => expect(mocks.trocar.current).toHaveBeenLastCalledWith(nivel))
      // espera a resposta antes da próxima tecla (um pedido por vez)
      await waitFor(() =>
        expect(screen.getByTestId('barra-demonstracao')).toHaveAttribute('data-nivel', nivel),
      )
      await act(async () => {
        await Promise.resolve()
      })
    }
    expect(mocks.trocar.current).toHaveBeenCalledTimes(4)
  })

  it('ignora a tecla com o foco num campo, com Ctrl e repetindo', async () => {
    montar()
    await screen.findByTestId('barra-demonstracao')
    fireEvent.keyDown(screen.getByLabelText('Campo de teste'), { key: '3' })
    fireEvent.keyDown(window, { key: '3', ctrlKey: true })
    fireEvent.keyDown(window, { key: '3', repeat: true })
    fireEvent.keyDown(window, { key: '9' })
    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.trocar.current).not.toHaveBeenCalled()
  })

  it('mostra a tecla de cada botão em um chip', async () => {
    montar()
    await screen.findByTestId('barra-demonstracao')
    expect(botao(/^NORMAL/)).toHaveTextContent('1')
    expect(botao(/^ATENÇÃO/)).toHaveTextContent('2')
    expect(botao(/^ALARME/)).toHaveTextContent('3')
    expect(botao(/^Parar/)).toHaveTextContent('0')
  })

  it('as teclas valem com a barra recolhida, e o recolhimento fica lembrado', async () => {
    const { unmount } = montar()
    await screen.findByTestId('barra-demonstracao')
    fireEvent.click(botao(/Recolher/))
    expect(botao(/Abrir/)).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('painel-demonstracao')).toHaveAttribute('hidden')
    fireEvent.keyDown(window, { key: '2' })
    await waitFor(() => expect(mocks.trocar.current).toHaveBeenCalledWith('ATENCAO'))
    unmount()

    montar()
    await screen.findByTestId('barra-demonstracao')
    expect(botao(/Abrir/)).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('BarraDeDemonstracao: leitor de tela', () => {
  it('a região viva anuncia a troca com o texto da API, e fica quieta no primeiro carregamento', async () => {
    montar()
    await screen.findByTestId('barra-demonstracao')
    const regiao = screen.getByTestId('anuncio-demonstracao')
    expect(regiao).toHaveAttribute('aria-live', 'polite')
    expect(regiao).toHaveAttribute('role', 'status')
    expect(regiao).toHaveTextContent('')

    mocks.trocar.current = vi.fn(() =>
      Promise.resolve(
        estadoDa({
          nivel: 'ALARME',
          volta_normal_em_s: 300,
          mensagem: 'A em alarme, B em atenção.',
        }),
      ),
    )
    fireEvent.click(botao(/^ALARME/))
    await waitFor(() =>
      expect(regiao).toHaveTextContent('Demonstração em ALARME. A em alarme, B em atenção.'),
    )
  })

  it('cada botão tem nome, estado e a forma própria (nunca só cor)', async () => {
    montar()
    await screen.findByTestId('barra-demonstracao')
    for (const nivel of ['NORMAL', 'ATENCAO', 'ALARME']) {
      const b = document.querySelector(`button[data-nivel="${nivel}"]`)
      expect(b).not.toBeNull()
      expect(b?.querySelector('svg path')).not.toBeNull()
    }
    const formas = ['NORMAL', 'ATENCAO', 'ALARME'].map((n) =>
      document.querySelector(`button[data-nivel="${n}"] svg path`)?.getAttribute('d'),
    )
    expect(new Set(formas).size).toBe(3)
  })
})

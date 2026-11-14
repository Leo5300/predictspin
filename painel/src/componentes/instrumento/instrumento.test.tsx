import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErroApi } from '@/api/erros'
import { TooltipProvider } from '@/componentes/ui/tooltip'

import { EstadoErro, EstadoVazio } from './Estados'
import { MarcaDeIdade } from './Idade'
import { Leitura } from './Leitura'
import { MarcadorPonto } from './MarcadorPonto'
import { Modulo } from './Modulo'
import { ReguaDesvio } from './ReguaDesvio'
import { SegurarParaConfirmar } from './SegurarParaConfirmar'
import { PlacaEstado, SeloAvaliacao } from './Selos'
import { FaixaSimulado, SeloSim } from './SeloSim'
import { Sparkline } from './Sparkline'
import { Tacometro } from './Tacometro'

const comDica = (no: React.ReactNode) => render(<TooltipProvider>{no}</TooltipProvider>)

describe('Leitura', () => {
  it('mostra rótulo, valor e unidade, e marca o valor velho', () => {
    const { container, rerender } = render(<Leitura rotulo="RMS" valor="0,045" unidade="g" />)
    expect(screen.getByText('RMS')).toBeInTheDocument()
    expect(screen.getByText('0,045')).toBeInTheDocument()
    expect(screen.getByText('g')).toBeInTheDocument()
    expect(container.querySelector('[data-velho]')).toBeNull()

    rerender(<Leitura rotulo="RMS" valor="0,045" unidade="g" velho />)
    expect(container.querySelector('[data-velho="true"]')).not.toBeNull()
  })

  it('traço de mudança só aparece depois que o valor muda, nunca no dado velho', () => {
    const { container, rerender } = render(<Leitura rotulo="RMS" valor="0,045" />)
    expect(container.querySelector('.bg-sinal')).toBeNull()
    rerender(<Leitura rotulo="RMS" valor="0,046" />)
    expect(container.querySelector('.bg-sinal')).not.toBeNull()
    rerender(<Leitura rotulo="RMS" valor="0,047" velho />)
    expect(container.querySelector('.bg-sinal')).toBeNull()
  })

  it('rótulo abreviado tem o nome por extenso e pode receber foco', () => {
    comDica(<Leitura rotulo="Curt" titulo="curtose" valor="2,47" />)
    const abreviacao = screen.getByTitle('curtose')
    expect(abreviacao).toHaveTextContent('Curt')
    expect(abreviacao).toHaveAttribute('tabindex', '0')
  })
})

describe('Sparkline', () => {
  it('com menos de dois valores mostra um traço, não uma linha inventada', () => {
    const { container } = render(<Sparkline valores={[0.05, null]} descricao="RMS de A" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('RMS de A: sem dados suficientes')).toBeInTheDocument()
  })

  it('quebra a linha na lacuna e destaca o último ponto', () => {
    const { container } = render(
      <Sparkline valores={[0.01, 0.02, null, 0.03, 0.04, 0.05]} descricao="RMS de B" />,
    )
    expect(screen.getByRole('img', { name: 'RMS de B' })).toBeInTheDocument()
    const caminhos = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '')
    // a lacuna gera um segundo "M" (subcaminho) no histórico
    expect(caminhos.join(' ').match(/M/g)?.length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('circle')).toHaveAttribute('fill', 'var(--sinal)')
  })

  it('velho perde a cor de sinal', () => {
    const { container } = render(<Sparkline valores={[0.01, 0.02, 0.03]} velho descricao="x" />)
    expect(container.querySelector('circle')).toHaveAttribute('fill', 'var(--texto-fraco)')
  })
})

describe('Régua de desvio', () => {
  it('sem referência fica neutra e diz por quê', () => {
    render(<ReguaDesvio valor={0.05} referencia={null} />)
    expect(screen.getByText('sem referência aprendida')).toBeInTheDocument()
  })

  it('com referência mostra o estado pela posição e pelo atributo', () => {
    const referencia = { centro: 0.05, tolerancia: 0.01, atencao: 0.08, alarme: 0.11 }
    const { container, rerender } = render(<ReguaDesvio valor={0.05} referencia={referencia} />)
    expect(container.querySelector('[data-estado="normal"]')).not.toBeNull()
    rerender(<ReguaDesvio valor={0.09} referencia={referencia} />)
    expect(container.querySelector('[data-estado="atencao"]')).not.toBeNull()
    rerender(<ReguaDesvio valor={0.2} referencia={referencia} rastro={[0.1, 0.12]} />)
    expect(container.querySelector('[data-estado="alarme"]')).not.toBeNull()
    expect(screen.getByRole('img', { name: /valor 0,200 g/ })).toBeInTheDocument()
  })
})

describe('Estado em dois canais (forma e texto, além da cor)', () => {
  it('marcador de ponto muda de forma e diz o estado ao leitor de tela', () => {
    const { container, rerender } = render(<MarcadorPonto codigo="A" />)
    const forma = () => container.querySelector('path')?.getAttribute('d') ?? ''
    const circulo = forma()
    expect(screen.getByText('Ponto A')).toBeInTheDocument()
    rerender(<MarcadorPonto codigo="A" avaliacao="atencao" />)
    expect(forma()).not.toBe(circulo)
    expect(screen.getByText('Ponto A, atenção')).toBeInTheDocument()
    rerender(<MarcadorPonto codigo="A" avaliacao="alarme" />)
    expect(screen.getByText('Ponto A, alarme')).toBeInTheDocument()
  })

  it('selo de avaliação e placa de estado levam texto e atributo', () => {
    render(
      <>
        <SeloAvaliacao avaliacao="sem_referencia" />
        <PlacaEstado estado="sem_dados" />
      </>,
    )
    expect(screen.getByText('SEM REFERÊNCIA').closest('[data-estado]')).toHaveAttribute(
      'data-estado',
      'sem_referencia',
    )
    expect(screen.getByText('SEM DADOS').closest('[data-estado]')).toHaveAttribute(
      'data-estado',
      'sem_dados',
    )
  })
})

describe('Simulado e dado velho', () => {
  it('selo SIM e faixa de dados simulados dizem que não é medição', () => {
    render(
      <>
        <SeloSim />
        <FaixaSimulado />
      </>,
    )
    expect(screen.getAllByText('(dado simulado, não é medição)')).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveTextContent('Dados simulados')
    expect(screen.getByRole('status')).toHaveClass('hachura')
  })

  it('módulo simulado leva o selo e o atributo', () => {
    const { container } = render(
      <Modulo rotulo="Ponto A" simulado>
        x
      </Modulo>,
    )
    expect(container.querySelector('[data-simulado="true"]')).not.toBeNull()
    expect(screen.getByText('SIM')).toBeInTheDocument()
  })

  it('marca de idade: vivo discreto, velho com "sem dados há"', () => {
    const { rerender } = render(<MarcaDeIdade frescor="vivo" idadeS={3} />)
    expect(screen.getByText('há 3 s')).toBeInTheDocument()
    rerender(<MarcaDeIdade frescor="velho" idadeS={137} />)
    expect(screen.getByText(/sem dados há/)).toHaveTextContent('sem dados há 2 min')
    rerender(<MarcaDeIdade frescor="ausente" idadeS={null} />)
    expect(screen.getByText('sem dados')).toBeInTheDocument()
  })
})

describe('Segurar para confirmar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('só confirma depois de 1,5 s pressionado; soltar antes cancela', () => {
    const aoConfirmar = vi.fn()
    render(<SegurarParaConfirmar aoConfirmar={aoConfirmar}>Descartar</SegurarParaConfirmar>)
    const botao = screen.getByRole('button', { name: /Descartar/ })

    fireEvent.pointerDown(botao, { button: 0 })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    fireEvent.pointerUp(botao)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(aoConfirmar).not.toHaveBeenCalled()

    fireEvent.pointerDown(botao, { button: 0 })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(aoConfirmar).toHaveBeenCalledTimes(1)
  })

  it('funciona pelo teclado', () => {
    const aoConfirmar = vi.fn()
    render(<SegurarParaConfirmar aoConfirmar={aoConfirmar}>Descartar</SegurarParaConfirmar>)
    const botao = screen.getByRole('button', { name: /Descartar/ })
    fireEvent.keyDown(botao, { key: ' ' })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(aoConfirmar).toHaveBeenCalledTimes(1)
    expect(botao).toHaveAccessibleDescription('Segure por 1,5 s para confirmar')
  })
})

describe('Estados', () => {
  it('erro mostra a mensagem e os campos do ErroResposta', () => {
    render(
      <EstadoErro
        erro={
          new ErroApi(400, {
            mensagem: 'Dados inválidos',
            campos: [{ campo: 'rotacoes_rpm', mensagem: 'não deve ser nulo' }],
          })
        }
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Dados inválidos')
    expect(screen.getByText('rotacoes_rpm')).toBeInTheDocument()
  })

  it('vazio honesto com ação', () => {
    render(<EstadoVazio titulo="Nenhuma medição real recebida." acao={<button>ver</button>} />)
    expect(screen.getByText('Nenhuma medição real recebida.')).toBeInTheDocument()
  })
})

describe('Tacômetro', () => {
  const nominais = [
    45, 71, 90, 112, 140, 180, 224, 265, 280, 355, 450, 560, 710, 900, 1120, 1400, 1800, 2240,
  ]

  it('mostra a rotação sem separador de milhar e a marcha mais próxima', () => {
    render(<Tacometro rpm={1180.4} nominais={nominais} />)
    expect(screen.getByTestId('rotacao')).toHaveTextContent('1180')
    expect(
      screen.getByRole('img', { name: /1180 rpm, marcha mais próxima 1120 rpm/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/\d+/).length).toBeGreaterThanOrEqual(18)
  })

  it('sem rotação não desenha ponteiro', () => {
    const { container } = render(<Tacometro rpm={null} nominais={nominais} />)
    expect(screen.getByText('sem rotação')).toBeInTheDocument()
    expect(container.querySelector('circle')).toBeNull()
  })
})

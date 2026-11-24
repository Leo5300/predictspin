import { screen } from '@testing-library/react-native'

import { montar } from '@/testes/ajudantes'

import { Galeria, MARCA_DA_GALERIA } from './Galeria'

// primeira montagem fora do prazo do teste (cache do Jest frio), como em telas.test.tsx
beforeAll(async () => {
  const { unmount } = await montar(<Galeria />)
  await unmount()
}, 120_000)

describe('galeria de estados', () => {
  it('monta inteira, com os estados de OS, coleta, gráfico, modelo e notificações', async () => {
    await montar(<Galeria />)
    expect(screen.getByTestId(MARCA_DA_GALERIA)).toBeTruthy()
    // OS: os cinco estados
    expect(screen.getByText('OS-2026-0007')).toBeTruthy()
    expect(screen.getByText('OS-2026-0011')).toBeTruthy()
    // coleta: três pré-voos, REC bloqueado diz por quê, fita com saturadas, carimbo
    expect(screen.getAllByTestId('pre-voo')).toHaveLength(3)
    expect(screen.getAllByTestId('motivo-sem-rec').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('traco-saturado')).toHaveLength(3)
    expect(screen.getByTestId('carimbo')).toBeTruthy()
    // modelo sem métricas diz o motivo
    expect(screen.getByText(/validação por dia não se aplica/)).toBeTruthy()
    // notificações: indisponível, desligada e ligada
    expect(screen.getByText('Notificações indisponíveis neste modo.')).toBeTruthy()
    expect(screen.getByText('Desligadas neste celular.')).toBeTruthy()
    expect(screen.getByText('Ligadas.')).toBeTruthy()
  })
})

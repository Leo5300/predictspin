import { render, screen } from '@testing-library/react-native'

import { encerrarSessao, reiniciarSessaoParaTeste } from '@/api/sessao'

import { TelaEntrar } from './TelaEntrar'

// sem mobile/.env (como na CI): a configuração é a que lerEnderecoDaApi dá para variável ausente
jest.mock('@/api/configuracao', () => {
  const { lerEnderecoDaApi } = jest.requireActual('@/dominio/endereco')
  return {
    ENDERECO_DA_API: lerEnderecoDaApi(undefined, true),
    URL_API: 'http://api-nao-configurada.invalid',
  }
})

afterAll(() => reiniciarSessaoParaTeste())

it('sem EXPO_PUBLIC_API_URL, a tela de entrada avisa que o endereço não foi configurado', async () => {
  await encerrarSessao(null)
  const fetchSimulado = jest.fn()
  global.fetch = fetchSimulado as unknown as typeof fetch
  await render(<TelaEntrar />)
  expect(screen.getByText('Endereço da API não configurado')).toBeTruthy()
  expect(screen.getByText(/EXPO_PUBLIC_API_URL em mobile\/\.env/)).toBeTruthy()
  expect(screen.queryByTestId('botao-entrar')).toBeNull()
  expect(fetchSimulado).not.toHaveBeenCalled()
})

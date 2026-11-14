import { expect, test } from '@playwright/test'

import {
  criarOperador,
  desativarUsuario,
  entrarPelaTela,
  usarFonte,
  type Credenciais,
} from './apoio/sessao'

let operador: (Credenciais & { id: number }) | null = null

test.beforeAll(async ({ request }) => {
  operador = await criarOperador(request)
})

test.afterAll(async ({ request }) => {
  if (operador) await desativarUsuario(request, operador.id)
})

test('ADMIN vê o link da coleta', async ({ page }) => {
  await entrarPelaTela(page)
  const navegacao = page.getByRole('navigation', { name: 'Principal' })
  await expect(navegacao.getByRole('link', { name: 'Coleta' })).toBeVisible()
})

test('OPERADOR não vê o que não pode abrir', async ({ page }) => {
  if (!operador) throw new Error('operador não criado')
  const pedidosDeEnsaios: string[] = []
  page.on('request', (pedido) => {
    if (/\/api\/v1\/(maquinas\/\d+\/ensaios|ensaios)/.test(pedido.url()))
      pedidosDeEnsaios.push(pedido.url())
  })
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page, operador)

  const navegacao = page.getByRole('navigation', { name: 'Principal' })
  await expect(navegacao.getByRole('link', { name: 'Visão geral' })).toBeVisible()
  await expect(navegacao.getByRole('link', { name: 'Coleta' })).toHaveCount(0)

  // pela URL, a tela não abre: aparece "sem permissão", e nada da coleta
  await page.goto('/coleta')
  await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Coleta', level: 1 })).toHaveCount(0)

  // a tela do ponto não pede os ensaios (rota só de ADMIN e TÉCNICO)
  await page.goto('/maquinas/1/pontos/A')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForTimeout(2000)
  expect(pedidosDeEnsaios).toEqual([])
})

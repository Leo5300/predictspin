import { expect, test, type Page } from '@playwright/test'

import {
  criarUsuarioDeTeste,
  desativarUsuario,
  entrarPelaTela,
  type Credenciais,
} from './apoio/sessao'

/** Diagnóstico (L4), usuários e o que cada papel vê. Contra o compose local. */

async function segurar(page: Page, nome: RegExp | string, dentroDe = page.locator('body')) {
  const botao = dentroDe.getByRole('button', { name: nome }).first()
  await botao.scrollIntoViewIfNeeded()
  const caixa = await botao.boundingBox()
  if (!caixa) throw new Error('botão sem caixa')
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1800)
  await page.mouse.up()
}

test('usuários: criar, e-mail repetido, senha curta e desativar segurando', async ({ page }) => {
  await entrarPelaTela(page)
  await page.goto('/diagnostico')
  const form = page.getByRole('region', { name: 'Novo usuário' })
  const email = `tecnico.novo.${Date.now()}@exemplo.com`

  // senha curta: o painel valida antes de enviar
  await form.getByLabel('Nome').fill('Técnica Nova')
  await form.getByLabel('E-mail').fill(email)
  await form.getByLabel('Senha (mínimo 8 caracteres)').fill('curta')
  await form.getByRole('button', { name: 'Criar usuário' }).click()
  await expect(form.getByText('A senha precisa de pelo menos 8 caracteres.')).toBeVisible()

  await form.getByLabel('Senha (mínimo 8 caracteres)').fill('SenhaForte123')
  await form.getByLabel('Papel').selectOption('TECNICO')
  await form.getByRole('button', { name: 'Criar usuário' }).click()
  const linha = page.locator(`[data-usuario="${email}"]`)
  await expect(linha).toContainText('Técnico')
  await expect(linha).toContainText('ativo')

  // o mesmo e-mail de novo: 409 da API no campo do e-mail
  await form.getByLabel('Nome').fill('Outra')
  await form.getByLabel('E-mail').fill(email)
  await form.getByLabel('Senha (mínimo 8 caracteres)').fill('SenhaForte123')
  await form.getByRole('button', { name: 'Criar usuário' }).click()
  await expect(form.getByText(/Já existe usuário com o e-mail/)).toBeVisible()

  await segurar(page, /Segure para desativar/, linha)
  await expect(linha).toContainText('desativado')
})

test.describe('cada papel só vê o que pode', () => {
  let tecnico: (Credenciais & { id: number }) | null = null
  let operador: (Credenciais & { id: number }) | null = null
  test.beforeAll(async ({ request }) => {
    tecnico = await criarUsuarioDeTeste(request, 'TECNICO')
    operador = await criarUsuarioDeTeste(request, 'OPERADOR')
  })
  test.afterAll(async ({ request }) => {
    if (tecnico) await desativarUsuario(request, tecnico.id)
    if (operador) await desativarUsuario(request, operador.id)
  })

  test('TÉCNICO: coleta e catálogos sem renomear; sem usuários', async ({ page }) => {
    if (!tecnico) throw new Error('sem técnico')
    await entrarPelaTela(page, tecnico)
    const nav = page.getByRole('navigation', { name: 'Principal' })
    await expect(nav.getByRole('link', { name: 'Coleta' })).toBeVisible()
    await page.goto('/diagnostico')
    await expect(page.getByRole('region', { name: 'Materiais' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Renomear/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Usuários' })).toHaveCount(0)
  })

  test('OPERADOR: diagnóstico, sem coleta, catálogos nem usuários', async ({ page }) => {
    if (!operador) throw new Error('sem operador')
    await entrarPelaTela(page, operador)
    const nav = page.getByRole('navigation', { name: 'Principal' })
    await expect(nav.getByRole('link', { name: 'Coleta' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Diagnóstico' })).toBeVisible()
    await page.goto('/diagnostico')
    await expect(page.getByRole('region', { name: 'Dispositivos' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Materiais' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Usuários' })).toHaveCount(0)
    await page.goto('/coleta/ensaios')
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible()
  })
})

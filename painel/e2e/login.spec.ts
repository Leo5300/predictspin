import { expect, test } from '@playwright/test'

import { ADMIN } from './apoio/ambiente'
import { entrarPelaTela, loginComIpProprio } from './apoio/sessao'

test('login com credenciais certas abre a visão geral', async ({ page }) => {
  await entrarPelaTela(page)
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sair do painel' })).toBeVisible()
})

test('senha errada fica no login e diz o que houve, sem dizer qual campo errou', async ({
  page,
}) => {
  await loginComIpProprio(page)
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(ADMIN.email)
  await page.getByLabel('Senha').fill('senha-errada-de-proposito')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('muitas falhas seguidas: 429 com o prazo para tentar de novo', async ({ page }) => {
  await loginComIpProprio(page)
  await page.goto('/login')
  const email = `bloqueio.${Date.now()}@exemplo.com`
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-errada-1')
  const entrar = page.getByRole('button', { name: 'Entrar' })
  // a API aceita 5 falhas por e-mail na janela; a sexta tentativa recebe 429
  for (let i = 0; i < 5; i += 1) {
    const resposta = page.waitForResponse('**/api/v1/auth/login')
    await entrar.click()
    expect((await resposta).status()).toBe(401)
  }
  const bloqueio = page.waitForResponse('**/api/v1/auth/login')
  await entrar.click()
  const resposta = await bloqueio
  expect(resposta.status()).toBe(429)
  expect(Number(resposta.headers()['retry-after'])).toBeGreaterThan(0)
  await expect(page.getByText(/Muitas tentativas com falha\. Tente de novo em/)).toBeVisible()
})

test('token guardado que a API recusa (401 em /auth/eu) volta ao login', async ({ page }) => {
  // grava o token recusado só no primeiro carregamento (o script roda a cada navegação)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e.preparado')) return
    sessionStorage.setItem('e2e.preparado', '1')
    sessionStorage.setItem(
      'ps.sessao',
      JSON.stringify({ token: 'invalido', expira_em: new Date(Date.now() + 60_000).toISOString() }),
    )
  })
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText('Sua sessão expirou. Entre novamente.')).toBeVisible()
  await expect(page.getByLabel('E-mail')).toBeVisible()
})

test('sem sessão, uma rota protegida leva ao login e volta para ela depois de entrar', async ({
  page,
}) => {
  await page.goto('/maquinas/1/pontos/A')
  await expect(page).toHaveURL(/\/login\?voltar=/)
  await page.getByLabel('E-mail').fill(ADMIN.email)
  await page.getByLabel('Senha').fill(ADMIN.senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/maquinas\/1\/pontos\/A/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ponto A')
})

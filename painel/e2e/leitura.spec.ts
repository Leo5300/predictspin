import { expect, test, type Page } from '@playwright/test'

import { entrarPelaTela, usarFonte } from './apoio/sessao'
import { ligarSimulador, type Simulador } from './apoio/simulador'

/*
 * Leitura com janelas chegando: o simulador (dados marcados como simulados) é ligado aqui e
 * desligado no fim. A fonte "Real" fica vazia, porque nenhum dispositivo real envia ao compose.
 */

let simulador: Simulador | null = null

test.beforeAll(() => {
  simulador = ligarSimulador()
})

test.afterAll(() => {
  simulador?.parar()
})

const ultimaJanela = (page: Page) => page.getByTestId('ultima-janela')

test('Real vazio diz que não há medição real e leva aos dados simulados, com a faixa', async ({
  page,
}) => {
  await usarFonte(page, 'real')
  await entrarPelaTela(page)
  await expect(page.getByText('Nenhuma medição real recebida.').first()).toBeVisible()
  await expect(page.getByText('Dados simulados', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Ver dados simulados' }).first().click()
  const faixa = page.getByRole('status').filter({ hasText: 'Dados simulados' })
  await expect(faixa).toBeVisible()
  await expect(faixa).toHaveClass(/hachura/)
  const fonte = page.getByRole('group', { name: 'Fonte dos dados' })
  await expect(fonte.getByRole('button', { name: 'Simulado' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('L1 → L2 → L3 pelo clique, com o caminho de volta', async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)

  const maquinas = page.getByRole('table', { name: 'Máquinas' })
  const primeira = maquinas.getByRole('link').first()
  const codigo = (await primeira.textContent())?.trim() ?? ''
  await primeira.click()
  await expect(page).toHaveURL(/\/maquinas\/\d+(\?.*)?$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(codigo)
  await expect(page.getByText('SIM').first()).toBeVisible()

  await page.getByRole('link', { name: /Abrir o ponto B/ }).click()
  await expect(page).toHaveURL(/\/maquinas\/\d+\/pontos\/B/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ponto B')
  await expect(page.getByTestId('area-do-grafico')).toBeVisible()

  const caminho = page.getByRole('navigation', { name: 'Caminho' })
  await caminho.getByRole('link', { name: codigo }).click()
  await expect(page).toHaveURL(/\/maquinas\/\d+(\?.*)?$/)
  await page
    .getByRole('navigation', { name: 'Caminho' })
    .getByRole('link', { name: 'Visão geral' })
    .click()
  await expect(page).toHaveURL('/')
})

test('dado velho: sem janelas, a marca de velho aparece em até 20 s', async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto('/maquinas/1')
  await expect(ultimaJanela(page)).toHaveAttribute('data-frescor', 'vivo', { timeout: 20_000 })

  simulador?.parar()
  const parouEm = Date.now()
  await expect(ultimaJanela(page)).toHaveAttribute('data-frescor', 'velho', { timeout: 20_000 })
  expect(Date.now() - parouEm).toBeLessThanOrEqual(20_000)
  await expect(ultimaJanela(page)).toContainText('sem dados há')
  await expect(page.locator('[data-velho="true"]').first()).toBeVisible()

  // volta a viver com a próxima janela
  simulador = ligarSimulador()
  await expect(ultimaJanela(page)).toHaveAttribute('data-frescor', 'vivo', { timeout: 30_000 })
})

test('AO VIVO: liga, o ritmo passa a 1 s, e desliga', async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto('/maquinas/1/pontos/B')
  await expect(ultimaJanela(page)).toHaveAttribute('data-frescor', 'vivo', { timeout: 20_000 })

  await page.getByRole('button', { name: /Ligar o modo ao vivo/ }).click()
  await expect(page.getByTestId('ao-vivo')).toBeVisible()
  await expect(page.getByTestId('faixa-ao-vivo')).toBeVisible()
  await expect(page.getByTestId('quadro-ao-vivo')).toBeVisible()

  // o simulador lê o plano na API e passa a mandar janelas de 1 s
  const rapidas = page.getByTestId('janelas-rapidas')
  await expect
    .poll(async () => Number((await rapidas.textContent())?.trim() ?? '0'), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(5)
  const antes = Number((await rapidas.textContent())?.trim() ?? '0')
  await page.waitForTimeout(4000)
  const depois = Number((await rapidas.textContent())?.trim() ?? '0')
  // em 4 s chegam ao menos 3 janelas novas: o ritmo é de 1 s, não de 5 s
  expect(depois - antes).toBeGreaterThanOrEqual(3)

  await page.getByRole('button', { name: 'Parar' }).click()
  await expect(page.getByRole('button', { name: /Ligar o modo ao vivo/ })).toBeVisible()
  await expect(page.getByTestId('faixa-ao-vivo')).toHaveCount(0)
  await expect(page.getByTestId('quadro-ao-vivo')).toHaveCount(0)
})

test('queda dos eventos: volta à consulta a cada 5 s e reconecta depois', async ({ page }) => {
  // a primeira conexão abre e cai logo (fim do fluxo); as seguintes são recusadas
  let conexoes = 0
  await page.route('**/api/v1/maquinas/*/eventos**', async (rota) => {
    conexoes += 1
    if (conexoes === 1) {
      await rota.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: ':batimento\n\n',
      })
    } else {
      await rota.abort('connectionreset')
    }
  })
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto('/maquinas/1')

  const conexao = page.getByRole('status').filter({ hasText: 'API ok' })
  await expect(conexao).toHaveAttribute('data-transporte', 'consulta', { timeout: 20_000 })
  await expect(conexao).toContainText('consulta a cada 5 s')
  // sem eventos, as janelas continuam chegando pela consulta: o dado não fica velho
  await page.waitForTimeout(16_000)
  await expect(ultimaJanela(page)).toHaveAttribute('data-frescor', 'vivo')
  expect(conexoes).toBeGreaterThanOrEqual(2)

  await page.unroute('**/api/v1/maquinas/*/eventos**')
  await expect(conexao).toHaveAttribute('data-transporte', 'eventos', { timeout: 45_000 })
})

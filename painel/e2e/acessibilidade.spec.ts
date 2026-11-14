import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { entrarPelaTela, usarFonte } from './apoio/sessao'
import { ligarSimulador, type Simulador } from './apoio/simulador'

/*
 * axe em todas as telas, nos dois temas (inclui o contraste de cor, AA), e navegação pelo teclado
 * com foco visível. Zero violações sérias ou críticas.
 */

let simulador: Simulador | null = null
test.beforeAll(() => {
  simulador = ligarSimulador()
})
test.afterAll(() => {
  simulador?.parar()
})

async function semViolacoesGraves(page: Page, tela: string) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const graves = resultado.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${tela}: ${v.id} (${v.nodes.length})`)
  expect(graves).toEqual([])
}

async function usarTema(page: Page, tema: 'grafite' | 'claro') {
  await page.addInitScript((valor) => {
    try {
      localStorage.setItem('ps.tema', valor)
    } catch {
      /* sem armazenamento */
    }
  }, tema)
}

for (const tema of ['grafite', 'claro'] as const) {
  test(`axe sem violações graves em todas as telas (tema ${tema})`, async ({ page }) => {
    await usarTema(page, tema)
    await usarFonte(page, 'simulado')
    await page.goto('/login')
    await expect(page.getByLabel('E-mail')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', tema)
    await semViolacoesGraves(page, 'login')

    await entrarPelaTela(page)
    await expect(page.getByRole('table', { name: 'Máquinas' })).toBeVisible()
    await semViolacoesGraves(page, 'L1')

    await page.goto('/maquinas/1')
    await expect(page.getByTestId('ultima-janela')).toHaveAttribute('data-frescor', 'vivo', {
      timeout: 20_000,
    })
    await semViolacoesGraves(page, 'L2')

    await page.goto('/maquinas/1/pontos/B')
    await expect(page.getByTestId('area-do-grafico')).toBeVisible()
    await semViolacoesGraves(page, 'L3')

    await page.getByRole('button', { name: /Ligar o modo ao vivo/ }).click()
    await expect(page.getByTestId('quadro-ao-vivo')).toBeVisible()
    await page.waitForTimeout(3000)
    await semViolacoesGraves(page, 'L3 AO VIVO')
    await page.getByRole('button', { name: 'Parar' }).click()
    await expect(page.getByRole('button', { name: /Ligar o modo ao vivo/ })).toBeVisible()

    await page.goto('/coleta')
    await expect(page.getByRole('heading', { name: 'Coleta', level: 1 })).toBeVisible()
    await semViolacoesGraves(page, 'coleta')

    await page.goto('/galeria.html')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await semViolacoesGraves(page, 'galeria')
  })
}

/** O elemento com foco tem contorno visível (outline ou anel) de pelo menos 2 px. */
async function focoVisivel(page: Page) {
  const contorno = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const estilo = getComputedStyle(el)
    return {
      outline: estilo.outlineStyle !== 'none' ? Number.parseFloat(estilo.outlineWidth) : 0,
      sombra: estilo.boxShadow,
    }
  })
  expect(contorno).not.toBeNull()
  expect((contorno?.outline ?? 0) >= 2 || (contorno?.sombra ?? 'none') !== 'none').toBeTruthy()
}

test('teclado: login, pular para o conteúdo, abrir a máquina e o ponto, com foco visível', async ({
  page,
}) => {
  await usarFonte(page, 'simulado')
  await page.goto('/login')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('E-mail')).toBeFocused()
  await focoVisivel(page)

  // entra só pelo teclado
  const { ADMIN } = await import('./apoio/ambiente')
  await page.keyboard.type(ADMIN.email)
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Senha')).toBeFocused()
  await page.keyboard.type(ADMIN.senha)
  await page.keyboard.press('Enter')
  await page.waitForURL('/')

  // numa página carregada, o primeiro Tab mostra o atalho para o conteúdo
  await page.reload()
  await expect(page.getByRole('table', { name: 'Máquinas' })).toBeVisible()
  await page.keyboard.press('Tab')
  const pular = page.getByRole('link', { name: 'Pular para o conteúdo' })
  await expect(pular).toBeFocused()
  await expect(pular).toBeVisible()
  await page.keyboard.press('Enter')

  // segue até a primeira máquina e abre com Enter
  const maquina = page.getByRole('table', { name: 'Máquinas' }).getByRole('link').first()
  for (
    let i = 0;
    i < 40 && !(await maquina.evaluate((el) => el === document.activeElement));
    i += 1
  ) {
    await page.keyboard.press('Tab')
  }
  await expect(maquina).toBeFocused()
  await focoVisivel(page)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/maquinas\/\d+(\?.*)?$/)

  const ponto = page.getByRole('link', { name: /Abrir o ponto A/ })
  await expect(ponto).toBeVisible()
  for (
    let i = 0;
    i < 60 && !(await ponto.evaluate((el) => el === document.activeElement));
    i += 1
  ) {
    await page.keyboard.press('Tab')
  }
  await expect(ponto).toBeFocused()
  await focoVisivel(page)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/pontos\/A/)

  // controles do ponto: o período da tendência se escolhe pelo teclado
  const periodo = page.getByRole('group', { name: 'Período da tendência' })
  const primeiro = periodo.getByRole('button').first()
  for (
    let i = 0;
    i < 60 && !(await primeiro.evaluate((el) => el === document.activeElement));
    i += 1
  ) {
    await page.keyboard.press('Tab')
  }
  await expect(primeiro).toBeFocused()
  await focoVisivel(page)
})

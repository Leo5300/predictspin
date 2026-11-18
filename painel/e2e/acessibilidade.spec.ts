import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { liberarMaquina } from './apoio/api'
import { definirPlano, entrarPelaTela, usarFonte } from './apoio/sessao'
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
  // contraste medido no estado final: itens que entram com opacidade (a checagem antes de gravar
  // aparece um a um) seriam lidos no meio da animação. Espera as animações finitas acabarem.
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (a) =>
              a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity,
          ),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined)
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const graves = resultado.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${tela}: ${v.id} (${v.nodes.length}) ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    )
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

    await liberarMaquina(page.request)
    await definirPlano(page.request, 1, [450, 1120])
    await page.goto('/coleta')
    await expect(page.getByTestId('matriz-cobertura')).toBeVisible()
    await semViolacoesGraves(page, 'coleta')

    await page.goto('/coleta/preparar?maquina=1&etapa=T3&condicao=normal&rotacao=1120')
    await expect(page.getByTestId('pre-voo').first()).toBeAttached()
    await page.getByLabel('Material').fill('aço')
    await semViolacoesGraves(page, 'preparar')

    await page.goto('/coleta/ensaios')
    await expect(page.getByRole('heading', { name: 'Ensaios gravados', level: 1 })).toBeVisible()
    await semViolacoesGraves(page, 'ensaios')

    await page.goto('/diagnostico')
    await expect(page.getByTestId('tabela-usuarios')).toBeVisible()
    await semViolacoesGraves(page, 'diagnóstico')

    await page.goto('/alarmes')
    await expect(
      page
        .getByRole('list', { name: 'Lista de alarmes' })
        .or(page.getByText('Nenhum alarme com estes filtros.')),
    ).toBeVisible()
    await semViolacoesGraves(page, 'alarmes')
    // os termos novos do "?" leem os limites da API
    await page.getByRole('button', { name: 'O que é Atenção e alarme?' }).first().click()
    await expect(page.getByTestId('balao-explica')).not.toContainText('{')
    await page.keyboard.press('Escape')
    // com um balão "?" aberto
    await page.getByRole('button', { name: 'O que é SIM (simulado)?' }).click()
    await expect(page.getByTestId('balao-explica')).toBeVisible()
    await semViolacoesGraves(page, 'alarmes com balão aberto')
    await page.keyboard.press('Escape')

    // paleta de comandos aberta
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Paleta de comandos' })).toBeVisible()
    await semViolacoesGraves(page, 'paleta de comandos')
    await page.keyboard.press('Escape')

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
  // o formulário aparece depois de a sessão guardada ser conferida
  await expect(page.getByLabel('E-mail')).toBeVisible()
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

test('"?": abre e fecha pelo toque e pelo teclado, com nome acessível', async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto('/maquinas/1')
  const botao = page.getByRole('button', { name: 'O que é RMS?' }).first()
  await expect(botao).toBeVisible()
  // toque (clique): abre; novo toque: fecha
  await botao.click()
  const balao = page.getByTestId('balao-explica')
  await expect(balao).toContainText('Quanto o ponto vibrou, em média, na janela.')
  await expect(balao).toContainText('Exemplo: RMS de 0,045 g no ponto A')
  await botao.click()
  await expect(balao).toBeHidden()
  // teclado: Enter abre, Esc fecha; Espaço abre de novo
  await botao.focus()
  await page.keyboard.press('Enter')
  await expect(balao).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(balao).toBeHidden()
  await botao.focus()
  await page.keyboard.press(' ')
  await expect(balao).toBeVisible()
  // clique fora fecha
  await page.mouse.click(5, 300)
  await expect(balao).toBeHidden()
})

test('"?" no celular: área de toque de pelo menos 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto('/maquinas/1')
  const botao = page.getByRole('button', { name: 'O que é RMS?' }).first()
  await botao.scrollIntoViewIfNeeded()
  // o alvo é o ícone mais a área invisível em volta (before:-inset-3.5): 16 + 2 × 14 = 44 px
  const caixa = await botao.evaluate((el) => {
    const antes = getComputedStyle(el, '::before')
    const r = el.getBoundingClientRect()
    return {
      largura: r.width - 2 * Number.parseFloat(antes.left),
      altura: r.height - 2 * Number.parseFloat(antes.top),
    }
  })
  expect(caixa.largura).toBeGreaterThanOrEqual(44)
  expect(caixa.altura).toBeGreaterThanOrEqual(44)
  await botao.click()
  await expect(page.getByTestId('balao-explica')).toBeVisible()
})

test('paleta de comandos: Ctrl+K abre, filtra, navega e Esc fecha', async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await expect(page.getByRole('button', { name: /Comandos/ })).toBeVisible()
  await page.keyboard.press('Control+k')
  const paleta = page.getByRole('dialog', { name: 'Paleta de comandos' })
  await expect(paleta.getByRole('combobox')).toBeFocused()
  await page.keyboard.type('diagn')
  await page.keyboard.press('Enter')
  await page.waitForURL(/diagnostico/)
  await expect(paleta).toBeHidden()
  await page.keyboard.press('Control+k')
  await expect(paleta).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(paleta).toBeHidden()
  // tema pela paleta
  await page.keyboard.press('Control+k')
  await expect(paleta.getByRole('combobox')).toBeFocused()
  await page.keyboard.type('tema claro')
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'claro')
})

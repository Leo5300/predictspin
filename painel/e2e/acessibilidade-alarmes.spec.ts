import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { entrarPelaTela, usarFonte } from './apoio/sessao'

/*
 * axe (WCAG 2.1 AA, inclui contraste) nas telas novas e alteradas pela regra de alarme, nos dois
 * temas, uma tela por teste. Zero violações sérias ou críticas. Com dado simulado já gravado (não liga
 * simulador: o estado de atenção/alarme, se houver, é o que estiver no banco local).
 */

async function semViolacoesGraves(page: Page, tela: string) {
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

const TELAS: { nome: string; rota: string; pronta: (page: Page) => Promise<void> }[] = [
  {
    nome: 'visão geral',
    rota: '/',
    pronta: (page) => expect(page.getByRole('table', { name: 'Máquinas' })).toBeVisible(),
  },
  {
    nome: 'máquina',
    rota: '/maquinas/1',
    pronta: (page) => expect(page.getByText('Desvio do RMS').first()).toBeVisible(),
  },
  {
    nome: 'alarmes',
    rota: '/alarmes',
    pronta: (page) =>
      expect(
        page
          .getByRole('list', { name: 'Lista de alarmes' })
          .or(page.getByText('Nenhum alarme com estes filtros.')),
      ).toBeVisible(),
  },
  {
    nome: 'diagnóstico',
    rota: '/diagnostico',
    pronta: (page) => expect(page.getByRole('region', { name: 'Limites em uso' })).toBeVisible(),
  },
  {
    nome: 'coleta',
    rota: '/coleta',
    pronta: (page) =>
      expect(
        page.getByRole('table', { name: 'Cobertura da referência por marcha e etapa' }),
      ).toBeVisible(),
  },
]

for (const tema of ['grafite', 'claro'] as const) {
  for (const tela of TELAS) {
    test(`axe: ${tela.nome} (tema ${tema})`, async ({ page }) => {
      await page.addInitScript((valor) => {
        try {
          localStorage.setItem('ps.tema', valor)
        } catch {
          /* sem armazenamento */
        }
      }, tema)
      await usarFonte(page, 'simulado')
      await entrarPelaTela(page)
      await page.goto(tela.rota)
      await tela.pronta(page)
      await semViolacoesGraves(page, tela.nome)
    })
  }
}

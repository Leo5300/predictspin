import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { URL_API } from './apoio/ambiente'
import { entrarPelaTela, tokenDoAdmin, usarFonte } from './apoio/sessao'

/*
 * axe (WCAG 2.1 AA, inclui contraste) nas telas novas e alteradas pela IA parte B, nos dois temas: Modelos,
 * detalhe do alerta, detalhe da OS e Diagnóstico (módulo da segunda opinião). Zero violações sérias ou críticas.
 * Usa o que já está gravado no banco local (dado simulado); o detalhe de alerta e de OS usa o mais recente.
 */

type Pagina<T> = { conteudo: T[] }

async function primeiro(request: APIRequestContext, caminho: string): Promise<number | null> {
  const token = await tokenDoAdmin(request)
  const r = await request.get(`${URL_API}${caminho}`, { headers: { Authorization: `Bearer ${token}` } })
  const pagina = (await r.json()) as Pagina<{ id: number }>
  return pagina.conteudo[0]?.id ?? null
}

async function semViolacoesGraves(page: Page, tela: string) {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const graves = resultado.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${tela}: ${v.id} (${v.nodes.length}) ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
  expect(graves).toEqual([])
}

for (const tema of ['grafite', 'claro'] as const) {
  test.describe(`tema ${tema}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((valor) => {
        try {
          localStorage.setItem('ps.tema', valor)
        } catch {
          /* sem armazenamento */
        }
      }, tema)
      await usarFonte(page, 'simulado')
      await entrarPelaTela(page)
    })

    test(`axe: modelos (${tema})`, async ({ page }) => {
      await page.goto('/coleta/modelos')
      await expect(page.getByRole('heading', { name: 'Modelos', level: 1 })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Versões' })).toBeVisible()
      await semViolacoesGraves(page, 'modelos')
    })

    test(`axe: detalhe do alerta (${tema})`, async ({ page, request }) => {
      const id = await primeiro(request, '/api/v1/alertas?simulado=true&size=1')
      expect(id, 'sem alerta simulado no banco local: rode antes o fluxo ia.spec.ts').not.toBeNull()
      await page.goto(`/alarmes/${String(id)}`)
      await expect(page.getByRole('region', { name: 'Segunda opinião' })).toBeVisible()
      await semViolacoesGraves(page, 'detalhe do alerta')
    })

    test(`axe: detalhe da OS (${tema})`, async ({ page, request }) => {
      const id = await primeiro(request, '/api/v1/ordens-servico?simulado=true&size=1')
      expect(id, 'sem OS simulada no banco local: rode antes o fluxo ia.spec.ts').not.toBeNull()
      await page.goto(`/ordens/${String(id)}`)
      await expect(page.getByRole('region', { name: 'Segunda opinião' })).toBeVisible()
      await semViolacoesGraves(page, 'detalhe da OS')
    })

    test(`axe: diagnóstico com a IA (${tema})`, async ({ page }) => {
      await page.goto('/diagnostico')
      await expect(page.getByRole('region', { name: 'Segunda opinião (IA)' })).toBeVisible()
      await semViolacoesGraves(page, 'diagnóstico')
    })
  })
}

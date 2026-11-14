import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { test, type Page } from '@playwright/test'

import { entrarPelaTela, usarFonte } from './apoio/sessao'
import { ligarSimulador, type Simulador } from './apoio/simulador'

/**
 * Prints de revisão de design (fora da suíte normal: só roda com PRINTS=1). Grava em
 * painel/prints/<PRINTS_PASTA>/ (fora do Git). TELAS filtra por prefixo, separado por vírgula.
 */
const ATIVO = process.env.PRINTS === '1'
const PASTA = path.resolve(import.meta.dirname, '..', 'prints', process.env.PRINTS_PASTA ?? 'atual')
const FILTRO = (process.env.TELAS ?? '').split(',').filter(Boolean)

const LARGURAS = [
  { nome: '1920', viewport: { width: 1920, height: 1080 } },
  { nome: '390', viewport: { width: 390, height: 844 } },
] as const
const TEMAS = ['grafite', 'claro'] as const

type Tela = {
  nome: string
  /** Prepara a tela (navega, abre o que for preciso). */
  abrir: (page: Page) => Promise<void>
  fonte?: 'real' | 'simulado'
  /** Página inteira (padrão) ou só a área visível. */
  inteira?: boolean
}

test.describe.configure({ mode: 'serial' })
test.skip(!ATIVO, 'prints só com PRINTS=1')

let simulador: Simulador | null = null
test.beforeAll(() => {
  mkdirSync(PASTA, { recursive: true })
  // com um simulador já rodando em segundo plano, PRINTS_SIMULADOR=0 evita o segundo
  if (process.env.PRINTS_SIMULADOR !== '0') simulador = ligarSimulador()
})
test.afterAll(() => simulador?.parar())

async function preparar(page: Page, tema: string) {
  await page.addInitScript((valor) => {
    try {
      localStorage.setItem('ps.tema', valor)
    } catch {
      /* sem armazenamento */
    }
  }, tema)
}

async function fotografar(page: Page, nome: string, inteira = true) {
  // o mouse sai de cima de tudo: hover não aparece no print
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`), fullPage: inteira })
}

export const TELAS: Tela[] = [
  {
    nome: 'l1-vivo',
    fonte: 'simulado',
    abrir: async (page) => {
      await page.goto('/')
      await page.getByText('OPERANDO').first().waitFor()
    },
  },
  {
    nome: 'l2-vivo',
    fonte: 'simulado',
    abrir: async (page) => {
      await page.goto('/maquinas/1')
      await page.getByRole('region', { name: 'Mapa de ordens' }).waitFor()
      await page.waitForTimeout(2500)
    },
  },
  {
    nome: 'l3-vivo',
    fonte: 'simulado',
    abrir: async (page) => {
      await page.goto('/maquinas/1/pontos/B')
      await page.waitForTimeout(2500)
    },
  },
  {
    nome: 'l3-aovivo',
    fonte: 'simulado',
    abrir: async (page) => {
      await page.goto('/maquinas/1/pontos/B')
      // o print anterior pode ter deixado o modo rápido ligado (dura 2 min)
      const ligar = page.getByRole('button', { name: /Ligar o modo ao vivo/ })
      const ligado = page.getByTestId('ao-vivo')
      await ligar.or(ligado).first().waitFor()
      if (await ligar.isVisible()) await ligar.click()
      await ligado.waitFor()
      await page.waitForTimeout(9000)
    },
  },
]

for (const tela of TELAS) {
  if (FILTRO.length > 0 && !FILTRO.some((f) => tela.nome.startsWith(f))) continue
  for (const largura of LARGURAS) {
    for (const tema of TEMAS) {
      test(`${tela.nome}-${tema}-${largura.nome}`, async ({ page }) => {
        await page.setViewportSize(largura.viewport)
        await preparar(page, tema)
        if (tela.fonte) await usarFonte(page, tela.fonte)
        await entrarPelaTela(page)
        await tela.abrir(page)
        await fotografar(page, `${tela.nome}-${tema}-${largura.nome}`, tela.inteira ?? true)
      })
    }
  }
}

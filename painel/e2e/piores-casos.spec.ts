import { expect, test, type Page } from '@playwright/test'

import { entrarPelaTela, usarFonte } from './apoio/sessao'
import { ligarSimulador, type Simulador } from './apoio/simulador'

/*
 * Piores casos realistas (break-ui) entrando pela fronteira dos dados: as respostas da API local
 * são trocadas no caminho, sem tocar nos componentes. Valores no limite do contrato (rotação até
 * 30000 rpm, grandezas até 1000 g, curtose até 1e6) e textos no limite do banco (código da máquina
 * 40, modelo 120, código do ponto 10).
 */

let simulador: Simulador | null = null
test.beforeAll(() => {
  simulador = ligarSimulador()
})
test.afterAll(() => {
  simulador?.parar()
})

test.use({ viewport: { width: 390, height: 844 } })

type Json = Record<string, unknown>
const NO_LIMITE = {
  rms_g: 999.999,
  pico_g: 1000,
  curtose: 999999.9,
  o1x: 1000,
  o2x: 0.0001,
  o3x: 0,
}

function noLimite(corpo: unknown): unknown {
  const janela = (j: Json) => {
    if (typeof j.medido_em !== 'string' || typeof j.pontos !== 'object' || j.pontos === null) return
    j.rotacao_rpm = 29999.9
    for (const ponto of Object.values(j.pontos as Record<string, Json>))
      Object.assign(ponto, NO_LIMITE)
  }
  if (Array.isArray(corpo)) {
    for (const j of corpo) janela(j as Json)
  } else if (corpo && typeof corpo === 'object') {
    const c = corpo as Json
    if (Array.isArray(c.conteudo)) {
      for (const j of c.conteudo) janela(j as Json)
    } else janela(c)
  }
  return corpo
}

async function trocarRespostas(page: Page, trocar: (url: string, corpo: unknown) => unknown) {
  await page.route('http://localhost:8080/api/v1/**', async (rota) => {
    const url = rota.request().url()
    // sem eventos, as janelas chegam pela consulta e passam pela troca
    if (url.includes('/eventos')) return rota.abort()
    try {
      const resposta = await rota.fetch()
      if (!(resposta.headers()['content-type'] ?? '').includes('json')) {
        await rota.fulfill({ response: resposta })
        return
      }
      await rota.fulfill({ response: resposta, json: trocar(url, await resposta.json()) })
    } catch {
      /* página fechada no meio da troca */
    }
  })
}

async function semRolagemLateral(page: Page) {
  const larguras = await page.evaluate(() => ({
    documento: document.documentElement.scrollWidth,
    janela: window.innerWidth,
  }))
  expect(larguras.documento).toBeLessThanOrEqual(larguras.janela)
}

test('valores no limite do contrato cabem inteiros no ponto, a 390 px', async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await trocarRespostas(page, (_url, corpo) => noLimite(corpo))
  await page.goto('/maquinas/1/pontos/B')
  const pico = page.locator('[data-velho], div').filter({ hasText: /^Pico/ }).first()
  await expect(page.getByText('1.000,000', { exact: true }).first()).toBeVisible()
  // nenhum valor do cabeçalho do ponto é cortado
  const cortados = await page
    .locator('.valor')
    .evaluateAll(
      (els) =>
        els.filter((el) => el.scrollWidth > el.clientWidth + 1 && /\d/.test(el.textContent)).length,
    )
  expect(cortados).toBe(0)
  await expect(pico).toBeVisible()
  await semRolagemLateral(page)

  await page.goto('/maquinas/1')
  await expect(page.getByTestId('rotacao')).toHaveText('30000')
  await semRolagemLateral(page)
})

/** Valores de dois dígitos e pico, 1X, 2X e 3X em desvio (a forma do estado vai ao lado do número). */
function emDesvio(corpo: unknown): unknown {
  const janela = (j: Json) => {
    if (typeof j.medido_em !== 'string' || typeof j.pontos !== 'object' || j.pontos === null) return
    for (const ponto of Object.values(j.pontos as Record<string, Json>)) {
      Object.assign(ponto, {
        rms_g: 12.345,
        pico_g: 15.987,
        curtose: 12.34,
        o1x: 10.876,
        o2x: 18.765,
        o3x: 17.654,
        avaliacao: {
          estado: 'alarme',
          etapa_ref: 'T3',
          generica: true,
          situacao: 'avaliada',
          z: { rms_g: 40, pico_g: 40, o1x: 40, o2x: 4, o3x: 40 },
        },
      })
    }
  }
  if (Array.isArray(corpo)) {
    for (const j of corpo) janela(j as Json)
  } else if (corpo && typeof corpo === 'object') {
    const c = corpo as Json
    if (Array.isArray(c.conteudo)) {
      for (const j of c.conteudo) janela(j as Json)
    } else janela(c)
  }
  return corpo
}

test('tela da máquina a 390 px: pico, 1X, 2X e 3X em desvio cabem sem cortar', async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await trocarRespostas(page, (_url, corpo) => emDesvio(corpo))
  await page.goto('/maquinas/1')
  const leituras = page.getByTestId('leituras-do-ponto').first()
  await expect(leituras.getByText('18,765', { exact: true })).toBeVisible()
  // as quatro leituras de baixo estão em desvio (forma do estado ao lado do número)
  await expect(leituras.locator('[data-estado]')).toHaveCount(5)
  const cortados = await page
    .getByTestId('leituras-do-ponto')
    .locator('.valor')
    .evaluateAll(
      (els) =>
        els.filter((el) => el.scrollWidth > el.clientWidth + 1 && /\d/.test(el.textContent)).length,
    )
  expect(cortados).toBe(0)
  await semRolagemLateral(page)
})

test('nome da máquina e código do ponto no limite do banco', async ({ page }) => {
  const codigo = 'TORNO-CNC-ROMI-GL280-LINHA-USINAGEM-0001'
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await trocarRespostas(page, (url, corpo) => {
    const caminho = new URL(url).pathname
    const c = corpo as Json
    const maquina = (m: Json) => {
      m.codigo = codigo
      m.modelo =
        'ROMI GL 280M com contraponto hidráulico, placa de 3 castanhas de 8 pol. e carenagem fechada'
    }
    if (caminho === '/api/v1/maquinas') (c.conteudo as Json[]).forEach(maquina)
    if (/^\/api\/v1\/maquinas\/\d+$/.test(caminho)) maquina(c)
    if (caminho.endsWith('/pontos'))
      for (const p of c.conteudo as Json[]) if (p.codigo === 'C') p.codigo = 'MANCAL-T2'
    return corpo
  })
  await page.goto('/maquinas/1')
  // o código da máquina aparece inteiro (quebra a linha, não é cortado)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(codigo)
  const titulo = page.getByRole('heading', { level: 1 })
  expect(await titulo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  // o ponto de código longo continua no esquema (posição pelo papel) e no mapa
  await expect(page.getByRole('link', { name: /Abrir o ponto MANCAL-T2/ }).first()).toBeVisible()
  await expect(page.getByText('A última janela não trouxe o ponto MANCAL-T2.')).toBeVisible()
  await semRolagemLateral(page)
})

test('sem nenhum valor no período, o gráfico não inventa escala', async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await trocarRespostas(page, (_url, corpo) => {
    const anular = (j: Json) => {
      if (typeof j.medido_em !== 'string') return
      j.rotacao_rpm = null
      for (const p of Object.values(j.pontos as Record<string, Json>))
        for (const g of Object.keys(NO_LIMITE)) p[g] = null
    }
    const c = corpo as Json
    if (Array.isArray(c.conteudo)) (c.conteudo as Json[]).forEach(anular)
    else anular(c)
    return corpo
  })
  await page.goto('/maquinas/1/pontos/B')
  await expect(page.getByText('Nenhum valor no período.').first()).toBeVisible()
  await expect(page.getByRole('img', { name: /nenhum valor no período/ }).first()).toBeVisible()
})

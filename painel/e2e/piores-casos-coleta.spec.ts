import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { entrarPelaTela, usarFonte } from './apoio/sessao'

/*
 * Piores casos da Parte B (break-ui), entrando pela fronteira dos dados: respostas da API local
 * trocadas no caminho, sem sujar o banco. Nomes longos de material e ferramenta, listas vazias,
 * catálogo com cem itens, cem ensaios, plano com dezoito rotações, valor enorme ou nulo, API fora do
 * ar, ensaio sem janelas e gravação de 10 minutos. Em cada um: nada de rolagem lateral no celular.
 * Os prints ficam em painel/prints/breakui-b (fora do Git).
 */
test.use({ viewport: { width: 390, height: 844 } })

const PASTA = path.resolve(import.meta.dirname, '..', 'prints', 'breakui-b')
mkdirSync(PASTA, { recursive: true })

const NOMINAIS = [
  45, 71, 90, 112, 140, 180, 224, 265, 280, 355, 450, 560, 710, 900, 1120, 1400, 1800, 2240,
]
const NOME_LONGO =
  'Aço SAE 4340 temperado e revenido, barra redonda trefilada de 101,6 mm do lote 2026/11 fornecedor B'
const FERRAMENTA_LONGA =
  'Pastilha de metal duro CNMG 120408-PM com quebra-cavaco para aço inoxidável'

async function semRolagemLateral(page: Page) {
  const larguras = await page.evaluate(() => ({
    documento: document.documentElement.scrollWidth,
    janela: window.innerWidth,
  }))
  expect(larguras.documento).toBeLessThanOrEqual(larguras.janela)
}

async function foto(page: Page, nome: string) {
  await page.mouse.move(0, 0)
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`), fullPage: true })
}

/** Troca o corpo das respostas JSON que casam com o trecho de URL. */
async function trocar(
  page: Page,
  trecho: RegExp,
  fazer: (corpo: Record<string, unknown>) => unknown,
) {
  await page.route(trecho, async (rota: Route) => {
    try {
      const resposta = await rota.fetch()
      const corpo = (await resposta.json()) as Record<string, unknown>
      await rota.fulfill({ response: resposta, json: fazer(corpo) })
    } catch {
      /* página fechada no meio */
    }
  })
}

const pagina = <T>(itens: T[], total = itens.length) => ({
  conteudo: itens,
  pagina: 0,
  tamanho: 20,
  total_elementos: total,
  total_paginas: Math.ceil(total / 20),
})

function ensaio(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    maquina_id: 1,
    codigo: `TORNO-01-T3-${String(id).padStart(5, '0')}`,
    etapa: 'T3',
    condicao: 'ferramenta_desgastada',
    material: NOME_LONGO,
    rotacao_alvo_rpm: 2240,
    avanco_alvo: 1.999,
    repeticao: 999,
    observacao: null,
    aberto: false,
    descartado: id % 7 === 0,
    simulado: true,
    iniciado_em: '2026-11-14T12:00:00Z',
    encerrado_em: '2026-11-14T12:10:00Z',
    material_item: { id: 1, nome: NOME_LONGO },
    ferramenta_item: { id: 2, nome: FERRAMENTA_LONGA },
    profundidade_corte_mm: 9.999,
    diametro_peca_mm: 499.99,
    fluido_corte: 'oleo_integral',
    ...extra,
  }
}

test.beforeEach(async ({ page }) => {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
})

test('plano com dezoito rotações: a matriz rola com a etapa fixa, a página não', async ({
  page,
}) => {
  await trocar(page, /\/api\/v1\/maquinas\/1$/, (m) => ({ ...m, rotacoes_coleta_rpm: NOMINAIS }))
  await page.route(/\/api\/v1\/maquinas\/1\/ensaios\?aberto=true/, (r) =>
    r.fulfill({ json: pagina([]) }),
  )
  await page.goto('/coleta')
  await expect(page.locator('[data-celula="T3|sensor_solto|2240"]')).toBeAttached()
  await semRolagemLateral(page)
  await foto(page, 'plano-18-rotacoes')
})

test('catálogo com cem itens de nome longo e itens parecidos', async ({ page }) => {
  const itens = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    nome: i % 2 ? `${NOME_LONGO} ${i}` : `Aço ${i}`,
    nome_normalizado: '',
    descricao: i % 3 ? null : FERRAMENTA_LONGA,
    ativo: true,
    criado_por: 1,
    criado_em: '2026-11-14T12:00:00Z',
  }))
  await page.route(/\/api\/v1\/(materiais|ferramentas)\?/, (r) =>
    r.fulfill({ json: pagina(itens, 100) }),
  )
  await page.goto('/diagnostico')
  await expect(page.getByTestId('catalogo-materiais')).toBeVisible()
  await semRolagemLateral(page)
  await foto(page, 'catalogo-100-itens')
  await page.goto('/coleta/preparar?maquina=1&etapa=T3&condicao=normal&rotacao=1120')
  await page.getByRole('button', { name: '2 Receita', exact: true }).click()
  await page.getByLabel('Material').fill('aço 4340 temperado')
  await semRolagemLateral(page)
  await foto(page, 'receita-nomes-longos')
})

test('cem ensaios com receita no limite e lista vazia', async ({ page }) => {
  await page.route(/\/api\/v1\/maquinas\/1\/ensaios\?.*page=/, (r) =>
    r.fulfill({
      json: pagina(
        Array.from({ length: 20 }, (_, i) => ensaio(i + 1)),
        100,
      ),
    }),
  )
  await page.goto('/coleta/ensaios?maquina=1&ensaio=1')
  await expect(page.getByTestId('lista-ensaios')).toBeVisible()
  await semRolagemLateral(page)
  await foto(page, 'ensaios-100')
  await page.unroute(/\/api\/v1\/maquinas\/1\/ensaios\?.*page=/)
  await page.route(/\/api\/v1\/maquinas\/1\/ensaios\?.*page=/, (r) =>
    r.fulfill({ json: pagina([]) }),
  )
  await page.goto('/coleta/ensaios?maquina=1')
  await expect(page.getByText(/Nenhum ensaio simulado com estes filtros/)).toBeVisible()
  await foto(page, 'ensaios-vazio')
})

test('ensaio sem janelas no replay e resumo com valores nulos', async ({ page }) => {
  await page.route(/\/api\/v1\/ensaios\/424242$/, (r) => r.fulfill({ json: ensaio(424242) }))
  await page.route(/\/api\/v1\/ensaios\/424242\/janelas/, (r) => r.fulfill({ json: pagina([]) }))
  await page.route(/\/api\/v1\/ensaios\/424242\/eventos/, (r) => r.fulfill({ json: pagina([]) }))
  await page.route(/\/api\/v1\/ensaios\/424242\/resumo/, (r) =>
    r.fulfill({
      json: {
        ensaio_id: 424242,
        codigo: 'TORNO-01-T3-424242',
        aberto: false,
        descartado: false,
        simulado: true,
        iniciado_em: '2026-11-14T12:00:00Z',
        encerrado_em: '2026-11-14T13:00:00Z',
        duracao_segundos: 3600,
        janelas: 0,
        janelas_saturadas: 0,
        rotacao_media_rpm: null,
        primeira_medicao: null,
        ultima_medicao: null,
      },
    }),
  )
  await page.goto('/coleta/ensaios/424242/replay')
  await expect(page.getByText('Este ensaio não tem janelas.')).toBeVisible()
  await foto(page, 'replay-sem-janelas')
  await page.route(/\/api\/v1\/maquinas\/1\/ensaios\?aberto=true/, (r) =>
    r.fulfill({ json: pagina([]) }),
  )
  await page.goto('/coleta?maquina=1&resumo=424242')
  await expect(page.getByText(/Nenhuma janela chegou durante a gravação/)).toBeVisible()
  await semRolagemLateral(page)
  await foto(page, 'resumo-sem-janelas')
})

test('gravação de 10 minutos: cronômetro e fita longa', async ({ page }) => {
  const inicio = Date.now() - 10 * 60 * 1000
  const aberto = ensaio(777, {
    aberto: true,
    encerrado_em: null,
    iniciado_em: new Date(inicio).toISOString(),
  })
  const janelas = Array.from({ length: 120 }, (_, i) => ({
    id: 900000 + i,
    medido_em: new Date(inicio + i * 5000).toISOString(),
    recebido_em: new Date(inicio + i * 5000 + 5200).toISOString(),
    rotacao_rpm: 2238,
    saturou: i % 40 === 3,
    modo: 'normal',
    amostras: i % 25 === 7 ? 7000 : 8000,
    amostras_esperadas: 8000,
    simulado: true,
    dispositivo: 'ps-sim-01',
    ensaio_id: 777,
    ensaio_codigo: aberto.codigo,
    pontos: {},
    canais: {},
  }))
  await page.route(/\/api\/v1\/maquinas\/1\/ensaios\?aberto=true/, (r) =>
    r.fulfill({ json: pagina([aberto]) }),
  )
  await page.route(/\/api\/v1\/ensaios\/777\/janelas/, (r) =>
    r.fulfill({ json: { ...pagina(janelas), total_paginas: 1 } }),
  )
  await page.route(/\/api\/v1\/ensaios\/777\/eventos/, (r) =>
    r.fulfill({
      json: pagina([
        {
          id: 1,
          ensaio_id: 777,
          ensaio_codigo: aberto.codigo,
          ocorrido_em: new Date(inicio + 200_000).toISOString(),
          motivo: 'pancada',
          nota: null,
          criado_por: 1,
          criado_em: new Date(inicio + 201_000).toISOString(),
        },
      ]),
    }),
  )
  await page.goto('/coleta?maquina=1')
  await expect(page.getByTestId('cronometro')).toContainText('10:')
  await expect(page.getByTestId('contador-janelas')).toHaveText('120')
  await semRolagemLateral(page)
  await foto(page, 'gravacao-10-min')
})

test('API fora do ar na coleta: diz o que houve, sem número inventado', async ({ page }) => {
  await page.route(/\/api\/v1\/maquinas\/1\/coleta\/cobertura/, (r) => r.abort('connectionrefused'))
  await page.route(/\/api\/v1\/maquinas\/1\/ensaios\?aberto=true/, (r) =>
    r.fulfill({ json: pagina([]) }),
  )
  await page.goto('/coleta')
  await expect(page.getByText(/API acordando|Sem conexão/).first()).toBeVisible({ timeout: 20_000 })
  await semRolagemLateral(page)
  await foto(page, 'coleta-api-fora')
})

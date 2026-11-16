import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import {
  abrirEnsaioPelaApi,
  encerrarPelaApi,
  ensaioAberto,
  itemDoCatalogo,
  liberarMaquina,
} from './apoio/api'
import { definirPlano, entrarPelaTela, usarFonte } from './apoio/sessao'
import { ligarSimulador, type Simulador } from './apoio/simulador'

/**
 * Coleta contra o compose local, com o simulador ligado (dados SIMULADOS). O fluxo principal roda no
 * celular (390 × 844): é como o técnico usa, em pé ao lado do torno.
 */
const CELULAR = { width: 390, height: 844 }
const PLANO = [450, 1120]

test.describe.configure({ mode: 'serial' })

let simulador: Simulador | null = null
test.beforeAll(async ({ request }) => {
  simulador = ligarSimulador()
  await definirPlano(request, 1, PLANO)
  await liberarMaquina(request)
})
test.afterAll(async ({ request }) => {
  simulador?.parar()
  await liberarMaquina(request)
})

const visivel = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true })

async function abrirColeta(page: Page) {
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto('/coleta')
}

function textoDaCelula(page: Page, chave: string) {
  return page.locator(`[data-celula="${chave}"]`).first().locator('.valor').innerText()
}

test.describe('no celular', () => {
  test.use({ viewport: CELULAR })

  test('gravação completa: sugestão → receita → pré-voo → REC → evento → encerrar → resumo → próxima da sessão', async ({
    page,
    request,
  }) => {
    await itemDoCatalogo(request, 'ferramentas', 'Bit de metal duro 60°')
    await abrirColeta(page)

    // sugestão
    await expect(page.getByTestId('sugestao')).toBeVisible()
    const antes = await textoDaCelula(page, 'T1|normal|1120')
    await page
      .getByTestId('sugestao')
      .getByRole('button', { name: /Preparar/ })
      .click()
    await page.waitForURL(/\/coleta\/preparar/)

    // passo 1: T1 a 1120 rpm, gravando a sequência
    await page.getByRole('radio', { name: /^T1/ }).click()
    await page.getByRole('radio', { name: '1120 rpm' }).click()
    await expect(page.getByTestId('cartao-instrucao').filter({ visible: true })).toContainText(
      'Ligue o torno na rotação alvo',
    )
    await page.getByLabel('Gravar a sequência nesta rotação (T1 → T2 → T3)').check()

    // passo 2: receita (ferramenta do catálogo, material novo com confirmação, avanço com vírgula)
    await page.getByRole('button', { name: '2 Receita', exact: true }).click()
    await page.getByLabel('Ferramenta').fill('bit metal duro')
    await page.getByRole('button', { name: /Bit de metal duro 60°/ }).click()
    const nomeNovo = `Latão e2e ${Date.now()}`
    await page.getByLabel('Material').fill(nomeNovo)
    await page.getByRole('button', { name: `Criar “${nomeNovo}” no catálogo` }).click()
    await page.getByRole('button', { name: 'Confirmar e usar' }).click()
    await expect(page.getByTestId('escolhido-materiais')).toContainText(nomeNovo)
    await page.getByLabel('Avanço').fill('0,12')

    // passo 3: pré-voo e REC
    await page.getByRole('button', { name: '3 Checagem', exact: true }).click()
    await expect(visivel(page, 'pre-voo').locator('li')).toHaveCount(6)
    await expect(visivel(page, 'pre-voo').locator('[data-estado="bloqueia"]')).toHaveCount(0)
    await visivel(page, 'botao-rec').click()

    // gravando
    await expect(page.getByTestId('gravacao')).toBeVisible()
    const codigo = await page.getByTestId('codigo-ensaio').innerText()
    expect(codigo).toMatch(/^TORNO-01-T1-\d{5}$/)
    await expect(page.getByTestId('cronometro')).toBeVisible()
    // marcar evento: o instante é o do toque; quatro motivos grandes
    await page
      .getByRole('button', { name: /Marcar evento/ })
      .filter({ visible: true })
      .click()
    await expect(page.getByTestId('painel-evento').filter({ visible: true })).toBeVisible()
    await page
      .getByTestId('painel-evento')
      .filter({ visible: true })
      .getByRole('button', { name: 'Pancada' })
      .click()
    await expect(page.getByTestId('painel-evento').filter({ visible: true })).toBeHidden()
    // janelas chegam (o simulador manda uma a cada 5 s)
    await expect(page.getByTestId('contador-janelas')).not.toHaveText('0', { timeout: 20_000 })
    await expect
      .poll(async () => Number(await page.getByTestId('contador-janelas').innerText()), {
        timeout: 20_000,
      })
      .toBeGreaterThanOrEqual(2)

    // encerrar e resumo
    await page.getByRole('button', { name: 'Encerrar' }).filter({ visible: true }).click()
    await expect(page.getByTestId('resumo-gravacao')).toBeVisible()
    const resumo = page.getByTestId('resumo-gravacao')
    await expect(resumo).toContainText(codigo)
    await expect(resumo.getByRole('region', { name: 'Gravação encerrada' })).toContainText(nomeNovo)
    await expect(resumo).toContainText('0,12 mm/volta')
    // a célula carimba e a cobertura muda
    const celula = page.locator('[data-celula="T1|normal|1120"]').first()
    await expect(celula).toHaveAttribute('data-carimbada', 'true')
    const depois = await textoDaCelula(page, 'T1|normal|1120')
    expect(Number(depois.split('/')[0])).toBe(Number(antes.split('/')[0]) + 1)
    // próxima da sessão
    await page.getByRole('button', { name: 'Preparar T2 a 1120 rpm' }).click()
    await page.waitForURL(/etapa=T2/)
    await expect(page.getByText(/Sessão: T2 de T1 → T2 → T3/)).toBeVisible()

    // recarregar: a sessão continua guardada neste navegador e a gravação aberta é retomada
    await page.goto('/coleta')
    // a sessão do teste anterior continua: próxima é T2
    await expect(page.getByText('Continuar sessão: próxima é T2 a 1120 rpm')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Continuar sessão: próxima é T2 a 1120 rpm')).toBeVisible()
    // ensaio aberto por outra pessoa: a coleta abre direto na gravação, também depois de recarregar
    const aberto = await abrirEnsaioPelaApi(request, {
      etapa: 'T2',
      condicao: 'normal',
      rotacao_alvo_rpm: 1120,
      simulado: true,
    })
    await page.reload()
    await expect(page.getByTestId('codigo-ensaio')).toHaveText(aberto.codigo)
    await page.reload()
    await expect(page.getByTestId('gravacao')).toBeVisible()
    // encerrar avança a sessão (T2 gravado)
    await page.getByRole('button', { name: 'Encerrar' }).filter({ visible: true }).click()
    await expect(page.getByTestId('resumo-gravacao')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Preparar T3 a 1120 rpm' })).toBeVisible()
    // encerrar a sessão
    await page.goto('/coleta')
    await page.getByRole('button', { name: 'Encerrar sessão' }).click()
    await expect(page.getByText(/Continuar sessão/)).toBeHidden()
  })

  test('descartar segurando o botão', async ({ page, request }) => {
    const aberto = await abrirEnsaioPelaApi(request, {
      etapa: 'T1',
      condicao: 'normal',
      rotacao_alvo_rpm: 450,
      simulado: true,
    })
    await abrirColeta(page)
    await expect(page.getByTestId('codigo-ensaio')).toHaveText(aberto.codigo)
    const descartar = page
      .getByRole('button', { name: /Segure para descartar/ })
      .filter({ visible: true })
    // no celular o descarte fica no fim da página, longe da zona do polegar: rola até ele
    await descartar.scrollIntoViewIfNeeded()
    const caixa = await descartar.boundingBox()
    if (!caixa) throw new Error('botão sem caixa')
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(1800)
    await page.mouse.up()
    await expect(page.getByTestId('sugestao')).toBeVisible()
    expect(await ensaioAberto(request)).toBeNull()
  })
})

test('nome parecido sugere o item que já existe antes de criar', async ({ page, request }) => {
  await itemDoCatalogo(request, 'materiais', 'Aço SAE 1045')
  await abrirColeta(page)
  await page.goto('/coleta/preparar?maquina=1&etapa=T3&condicao=normal&rotacao=1120')
  const campo = page.getByLabel('Material')
  await campo.fill('aço 1045')
  const opcoes = page.getByTestId('opcoes-materiais')
  await expect(opcoes).toContainText('Parecido')
  await expect(opcoes.getByRole('button', { name: /Aço SAE 1045.*é esse\?/ })).toBeVisible()
  // mesmo nome escrito de outro jeito: é o mesmo item
  await campo.fill('ACO sae-1045')
  await expect(opcoes.getByRole('button', { name: /Aço SAE 1045.*mesmo nome/ })).toBeVisible()
  await opcoes.getByRole('button', { name: /Aço SAE 1045/ }).click()
  await expect(page.getByTestId('escolhido-materiais')).toHaveText(/Aço SAE 1045/)
})

test('o segundo ensaio aberto responde 409 e leva à gravação aberta', async ({ page, request }) => {
  await liberarMaquina(request)
  await abrirColeta(page)
  await page.goto('/coleta/preparar?maquina=1&etapa=T1&condicao=normal&rotacao=1120')
  await expect(visivel(page, 'pre-voo').locator('[data-estado="bloqueia"]')).toHaveCount(0)
  // a checagem bloqueia o REC quando sabe do ensaio aberto (o evento ao vivo avisa). Para chegar ao
  // 409 da API, o painel passa a não saber: a consulta do ensaio aberto volta vazia
  await page.route('**/api/v1/maquinas/1/ensaios?aberto=true*', (rota) =>
    rota.fulfill({
      json: { conteudo: [], pagina: 0, tamanho: 1, total_elementos: 0, total_paginas: 0 },
    }),
  )
  // outra pessoa abre um ensaio depois que a checagem já estava na tela
  const outro = await abrirEnsaioPelaApi(request, {
    etapa: 'T1',
    condicao: 'normal',
    rotacao_alvo_rpm: 1120,
    simulado: true,
  })
  await visivel(page, 'botao-rec').click()
  await expect(page.getByRole('alert').filter({ hasText: outro.codigo })).toBeVisible()
  await page.unroute('**/api/v1/maquinas/1/ensaios?aberto=true*')
  await page.getByRole('link', { name: 'Ir para a gravação aberta' }).click()
  await expect(page.getByTestId('codigo-ensaio')).toHaveText(outro.codigo)
  await encerrarPelaApi(request, outro.id)
})

test('corrigir a receita mostra o histórico de cada campo', async ({ page, request }) => {
  await liberarMaquina(request)
  const ensaio = await abrirEnsaioPelaApi(request, {
    etapa: 'T3',
    condicao: 'normal',
    rotacao_alvo_rpm: 1120,
    avanco_alvo: 0.15,
    simulado: true,
  })
  await encerrarPelaApi(request, ensaio.id)
  await abrirColeta(page)
  await page.goto(`/coleta/ensaios?maquina=1&ensaio=${ensaio.id}`)
  const linha = page.locator(`[data-ensaio="${ensaio.codigo}"]`)
  await linha.getByRole('button', { name: 'Corrigir receita' }).click()
  await linha.getByLabel('Avanço').fill('0,1')
  await linha.getByRole('button', { name: 'Gravar correção' }).click()
  const historico = linha.getByTestId('historico')
  await expect(historico).toContainText('Avanço (mm/volta)')
  await expect(historico).toContainText('0,15')
  await expect(historico).toContainText('0,1')
})

test('editar o plano muda as colunas da matriz', async ({ page, request }) => {
  await liberarMaquina(request)
  await abrirColeta(page)
  await page.getByText('Plano e meta').click()
  const plano = page.getByTestId('plano-e-meta')
  await plano.getByRole('button', { name: '900', exact: true }).click()
  await plano.getByRole('button', { name: 'Gravar plano' }).click()
  await expect(page.locator('[data-celula="T1|normal|900"]')).toBeVisible()
  await definirPlano(request, 1, PLANO)
})

test('baixa o CSV com o nome da API e as colunas novas no fim', async ({ page }) => {
  await abrirColeta(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('button', { name: /Exportar CSV/ })
      .first()
      .click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^ensaios-\d{8}-\d{6}-simulados\.csv$/)
  const caminho = await download.path()
  const cabecalho = readFileSync(caminho, 'utf8').split('\n')[0] ?? ''
  expect(cabecalho.startsWith('ensaio,etapa,condicao,material')).toBe(true)
  expect(
    cabecalho.endsWith(
      'ferramenta,profundidade_corte_mm,diametro_peca_mm,fluido_corte,evento_marcado',
    ),
  ).toBe(true)
})

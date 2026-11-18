import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { URL_API } from './apoio/ambiente'
import { entrarPelaTela, tokenDoAdmin, usarFonte } from './apoio/sessao'
import { executarRoteiro, ligarSimulador, type Simulador } from './apoio/simulador'

/**
 * Fluxo do alarme de ponta a ponta, com DADO SIMULADO (prova o encadeamento, não a detecção real):
 * simulador normal → nenhum alarme; severo → atenção e alarme depois do atraso, ao vivo na tela →
 * reconhecer segurando → OS abre → assumir → concluir rejeitada → indicadores no Diagnóstico.
 * Precisa da API com o perfil de tempos curtos: $env:PERFIL_API = "tempos-curtos"; docker compose up -d api
 */

type Limites = { alarme: { atraso_s: number; saida_s: number } }
type Pagina<T> = { conteudo: T[] }
type AlertaApi = { id: number; criado_em: string; estado: string }
type OrdemApi = { id: number; status: string }

async function api<T>(request: APIRequestContext, token: string, caminho: string): Promise<T> {
  const resposta = await request.get(`${URL_API}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(resposta.ok(), caminho).toBeTruthy()
  return (await resposta.json()) as T
}

async function segurar(page: Page, nome: string, dentroDe = page.locator('body')) {
  const botao = dentroDe.getByRole('button', { name: nome }).first()
  await botao.scrollIntoViewIfNeeded()
  const caixa = await botao.boundingBox()
  if (!caixa) throw new Error('botão sem caixa')
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1800)
  await page.mouse.up()
}

let simulador: Simulador | null = null
test.afterEach(() => {
  simulador?.parar()
  simulador = null
})

test('fluxo do alarme: normal, severo, reconhecer, OS e Diagnóstico', async ({ page, request }) => {
  test.setTimeout(300_000)
  const token = await tokenDoAdmin(request)
  const autorizacao = { Authorization: `Bearer ${token}` }
  const limites = await api<Limites>(request, token, '/api/v1/alarmes/limites')
  test.skip(
    limites.alarme.atraso_s > 10,
    'API com tempos normais: suba com $env:PERFIL_API = "tempos-curtos"; docker compose up -d api',
  )

  // referência simulada a 1120 rpm (T0, T1 e T3) e versão nova
  executarRoteiro([
    '--etapas',
    'T0,T1,T3',
    '--condicoes',
    'normal',
    '--rotacoes',
    '1120',
    '--janelas',
    '30',
    '--material',
    'aço 1045',
    '--semente',
    '11',
  ])
  const recalculo = await request.post(
    `${URL_API}/api/v1/maquinas/1/referencias/recalcular?simulado=true`,
    { headers: autorizacao },
  )
  expect(recalculo.status()).toBe(201)

  // OS simuladas deixadas por execuções anteriores não podem segurar a abertura de uma nova
  const abertas = await api<Pagina<OrdemApi>>(
    request,
    token,
    '/api/v1/ordens-servico?simulado=true&size=200',
  )
  for (const os of abertas.conteudo.filter(
    (o) => o.status === 'aberta' || o.status === 'em_andamento',
  )) {
    await request.post(`${URL_API}/api/v1/ordens-servico/${os.id}/concluir`, {
      headers: autorizacao,
      data: { retorno: 'rejeitada', comentario: 'encerrada pelo teste de ponta a ponta' },
    })
  }

  await entrarPelaTela(page)
  await usarFonte(page, 'simulado')
  await page.goto('/alarmes')
  await expect(page.getByRole('heading', { name: 'Alarmes e ordens de serviço' })).toBeVisible()

  // 1) normal: nenhum alarme novo (e os que estavam ativos voltam ao normal)
  const inicioNormal = new Date().toISOString()
  simulador = ligarSimulador(['--rotacao', '1120', '--intervalo', '2'])
  await page.waitForTimeout((limites.alarme.saida_s + 15) * 1000)
  simulador.parar()
  const duranteNormal = await api<Pagina<AlertaApi>>(
    request,
    token,
    `/api/v1/alertas?simulado=true&tipo=maquina&de=${encodeURIComponent(inicioNormal)}`,
  )
  expect(duranteNormal.conteudo, 'nenhum alarme com o simulador normal').toHaveLength(0)

  // 2) severo: o alarme aparece ao vivo, depois do atraso
  simulador = ligarSimulador(['--modo', 'severo', '--rotacao', '1120', '--intervalo', '2'])
  const novo = page
    .getByTestId('linha-alarme')
    .and(page.locator('[data-estado="ativo_nao_reconhecido"][data-nivel="alarme"]'))
    .first()
  await expect(novo).toBeVisible({ timeout: 90_000 })
  await expect(novo).toContainText('Ação recomendada')

  // 3) reconhecer segurando: o mesmo alerta fica reconhecido (não some)
  const ponto = (await novo.locator('.valor.font-semibold').nth(1).textContent())?.trim()
  await segurar(page, 'Segure para reconhecer', novo)
  await expect(
    page
      .getByTestId('linha-alarme')
      .and(page.locator('[data-estado="ativo_reconhecido"]'))
      .filter({ hasText: `ponto ${ponto ?? ''}` })
      .first(),
  ).toBeVisible({ timeout: 20_000 })

  // 4) OS abre (alarme contínuo ou severidade) e aparece ao vivo
  const os = page.getByTestId('linha-os').and(page.locator('[data-status="aberta"]')).first()
  await expect(os).toBeVisible({ timeout: 90_000 })
  simulador.parar()
  await os.getByRole('button', { name: 'Assumir OS' }).click()
  const andamento = page
    .getByTestId('linha-os')
    .and(page.locator('[data-status="em_andamento"]'))
    .first()
  await expect(andamento).toBeVisible()
  await andamento.getByRole('button', { name: 'Concluir OS…' }).click()
  await andamento.getByLabel('rejeitada: falso positivo').check()
  await andamento.getByLabel('Comentário').fill('Teste de ponta a ponta com dado simulado')
  await andamento.getByRole('button', { name: 'Concluir OS' }).click()
  await expect(
    page
      .getByTestId('linha-os')
      .filter({ hasText: 'Teste de ponta a ponta com dado simulado' })
      .first(),
  ).toContainText('rejeitada: falso positivo')

  // 5) Diagnóstico: limites lidos da API e indicadores com o alerta de agora
  await page.goto('/diagnostico')
  const regra = page.getByRole('region', { name: 'Indicadores de desempenho do alarme' })
  await expect(regra).toContainText('Alertas por hora')
  await expect(page.getByRole('region', { name: 'Limites em uso' })).toContainText(
    `${limites.alarme.atraso_s} s`,
  )
  const alertasPorHora = await regra.locator('dd').first().textContent()
  expect(Number((alertasPorHora ?? '0').replace(',', '.'))).toBeGreaterThan(0)
})

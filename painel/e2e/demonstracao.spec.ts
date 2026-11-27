import { mkdirSync } from 'node:fs'
import path from 'node:path'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { RAIZ_DO_REPOSITORIO, URL_API } from './apoio/ambiente'
import { entrarPelaTela, tokenDoAdmin, usarFonte } from './apoio/sessao'
import { executarRoteiro } from './apoio/simulador'

/**
 * Barra de demonstração, de ponta a ponta contra a API LOCAL (nunca a publicada), com DADO SIMULADO: prova o
 * encadeamento (barra, gerador, ingestão, alerta, alarme), não a detecção real.
 *
 * Precisa da API com a demonstração ligada e os tempos curtos:
 *   $env:PS_DEMO_HABILITADO = "true"; $env:PS_DEMO_JANELA_S = "2"; $env:PERFIL_API = "tempos-curtos"
 *   docker compose up -d api
 * Os prints (PRINTS_DEMO=1) vão para docs/evidencias/painel/.
 */

type Pagina<T> = { conteudo: T[] }
type AlertaApi = { id: number; ponto: string; estado: string; nivel: string; simulado: boolean }
type OrdemApi = { id: number; status: string }
type EstadoDemo = { nivel: string; referencia_ok: boolean; volta_normal_em_s: number | null }

test.describe.configure({ mode: 'serial', timeout: 240_000 })

let token = ''
let preparado = true
let motivo = ''

async function chamar(request: APIRequestContext, caminho: string, metodo = 'GET', data?: object) {
  const r = await request.fetch(`${URL_API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}` },
    data,
  })
  return { status: r.status(), corpo: r.ok() ? ((await r.json()) as unknown) : null }
}

async function listarAlertas(request: APIRequestContext, consulta: string) {
  const r = await chamar(request, `/api/v1/alertas?${consulta}`)
  return (r.corpo as Pagina<AlertaApi> | null)?.conteudo ?? []
}

async function definirNivel(request: APIRequestContext, nivel: string) {
  const r = await chamar(request, '/api/v1/demo/cenario', 'POST', { nivel })
  expect(r.status).toBe(200)
  return r.corpo as EstadoDemo
}

/** Fecha o que sobrou de execuções anteriores: alertas normalizados são reconhecidos, OS abertas, concluídas. */
async function limparSobras(request: APIRequestContext) {
  const alertas = await listarAlertas(request, 'simulado=true&tipo=maquina&size=100')
  for (const a of alertas) {
    if (a.estado === 'normalizado_nao_reconhecido' || a.estado === 'ativo_nao_reconhecido') {
      await chamar(request, `/api/v1/alertas/${a.id}/reconhecer`, 'POST')
    }
  }
  const ordens = await chamar(request, '/api/v1/ordens-servico?simulado=true&size=200')
  for (const os of (ordens.corpo as Pagina<OrdemApi> | null)?.conteudo ?? []) {
    if (os.status === 'aberta' || os.status === 'em_andamento') {
      await chamar(request, `/api/v1/ordens-servico/${os.id}/concluir`, 'POST', {
        retorno: 'rejeitada',
        comentario: 'encerrada pelo teste da demonstração',
      })
    }
  }
}

test.beforeAll(async ({ request }) => {
  token = await tokenDoAdmin(request)
  const estado = await chamar(request, '/api/v1/demo/estado')
  if (estado.status !== 200) {
    preparado = false
    motivo = 'API sem a demonstração: suba com PS_DEMO_HABILITADO=true (veja o topo deste arquivo)'
    return
  }
  const limites = await chamar(request, '/api/v1/alarmes/limites')
  if (((limites.corpo as { alarme: { atraso_s: number } } | null)?.alarme.atraso_s ?? 99) > 10) {
    preparado = false
    motivo = 'API com tempos normais: suba com PERFIL_API=tempos-curtos'
    return
  }
  // referência simulada a 1120 rpm (T0, T1 e T3): só grava ensaios se ainda não houver (o roteiro termina "agora" e
  // dois roteiros a menos de 8 min um do outro se cruzam, e o simulador recusa)
  const atual = await chamar(request, '/api/v1/maquinas/1/referencias?simulado=true')
  const cobertura = JSON.stringify((atual.corpo as { cobertura?: unknown } | null)?.cobertura ?? [])
  const temReferencia =
    cobertura.includes('"marcha_rpm":1120,"etapa":"T1","situacao":"com"') &&
    cobertura.includes('"marcha_rpm":1120,"etapa":"T3","situacao":"com"')
  if (!temReferencia) {
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
    const recalculo = await chamar(
      request,
      '/api/v1/maquinas/1/referencias/recalcular?simulado=true',
      'POST',
    )
    expect(recalculo.status).toBe(201)
  }
  // começa do zero: sem alerta, OS nem estado de ponto simulado de execuções anteriores
  expect((await chamar(request, '/api/v1/demo/zerar', 'POST')).status).toBe(200)
})

test.beforeEach(() => {
  test.skip(!preparado, motivo)
})

test.afterEach(async ({ request }) => {
  if (!preparado) return
  await definirNivel(request, 'PARADA')
  await limparSobras(request)
})

const barra = (page: Page) => page.getByTestId('barra-demonstracao')
const botao = (page: Page, nome: RegExp) => barra(page).getByRole('button', { name: nome })

test('fluxo: atenção, alarme, normal, reconhecer e encerrar', async ({ page, request }) => {
  await limparSobras(request)
  const inicio = new Date().toISOString()
  await entrarPelaTela(page)
  await usarFonte(page, 'simulado')
  await page.goto('/alarmes')
  await expect(page.getByRole('heading', { name: 'Alarmes e ordens de serviço' })).toBeVisible()
  await expect(barra(page)).toBeVisible()
  await expect(barra(page)).toContainText('Demonstração · dados simulados')

  // 1) ATENÇÃO pelo botão: o botão marcado é o que a API respondeu, e A aparece em atenção
  await botao(page, /^ATENÇÃO/).click()
  await expect(botao(page, /^ATENÇÃO/)).toHaveAttribute('aria-pressed', 'true')
  await expect(botao(page, /^ALARME/)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('contagem-demonstracao')).toContainText('volta ao normal em')
  const atencaoA = page
    .getByTestId('linha-alarme')
    .and(page.locator('[data-nivel="atencao"][data-estado="ativo_nao_reconhecido"]'))
    .filter({ hasText: 'ponto A' })
    .first()
  await expect(atencaoA).toBeVisible({ timeout: 90_000 })

  // 2) ALARME pela tecla 3 (sem tocar na barra): A vai a alarme, na tela em que estiver
  await page.keyboard.press('3')
  await expect(botao(page, /^ALARME/)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('anuncio-demonstracao')).toContainText('Demonstração em ALARME')
  const alarmeA = page
    .getByTestId('linha-alarme')
    .and(page.locator('[data-nivel="alarme"]'))
    .filter({ hasText: 'ponto A' })
    .first()
  await expect(alarmeA).toBeVisible({ timeout: 90_000 })

  // 3) NORMAL: os pontos normalizam e o alarme espera o reconhecimento
  await botao(page, /^NORMAL/).click()
  await expect(botao(page, /^NORMAL/)).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(
      async () => {
        const alertas = await listarAlertas(
          request,
          `simulado=true&tipo=maquina&ponto=A&de=${encodeURIComponent(inicio)}`,
        )
        return alertas[0]?.estado
      },
      { timeout: 90_000, intervals: [2_000] },
    )
    .toBe('normalizado_nao_reconhecido')

  // 4) reconhecer segurando encerra o alerta normalizado
  const normalizado = page
    .getByTestId('linha-alarme')
    .and(page.locator('[data-estado="normalizado_nao_reconhecido"]'))
    .filter({ hasText: 'ponto A' })
    .first()
  await expect(normalizado).toBeVisible({ timeout: 30_000 })
  const botaoReconhecer = normalizado.getByRole('button', { name: 'Segure para reconhecer' })
  await botaoReconhecer.scrollIntoViewIfNeeded()
  const caixa = await botaoReconhecer.boundingBox()
  if (!caixa) throw new Error('botão sem caixa')
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1800)
  await page.mouse.up()
  await expect
    .poll(
      async () => {
        const alertas = await listarAlertas(
          request,
          `simulado=true&tipo=maquina&ponto=A&de=${encodeURIComponent(inicio)}`,
        )
        return alertas[0]?.estado
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toBe('encerrado')

  // 5) Parar: nada mais é gerado, e o botão Parar fica marcado
  await botao(page, /^Parar/).click()
  await expect(botao(page, /^Parar/)).toHaveAttribute('aria-pressed', 'true')
  await expect(barra(page)).toHaveAttribute('data-nivel', 'PARADA')
})

test('segurar "zerar" apaga os alertas e as OS simulados e para a demonstração', async ({
  page,
  request,
}) => {
  await entrarPelaTela(page)
  await usarFonte(page, 'simulado')
  await page.goto('/alarmes')
  await expect(barra(page)).toBeVisible()
  await botao(page, /^ALARME/).click()
  await expect
    .poll(async () => (await listarAlertas(request, 'simulado=true&tipo=maquina')).length, {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toBeGreaterThan(0)

  const zerar = botao(page, /Segure para zerar/)
  const caixa = await zerar.boundingBox()
  if (!caixa) throw new Error('botão sem caixa')
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1800)
  await page.mouse.up()

  await expect(barra(page)).toHaveAttribute('data-nivel', 'PARADA')
  await expect(page.getByTestId('mensagem-demonstracao')).toContainText('Zerado:')
  expect(await listarAlertas(request, 'simulado=true&tipo=maquina')).toHaveLength(0)
  const ordens = await chamar(request, '/api/v1/ordens-servico?simulado=true&size=200')
  expect((ordens.corpo as Pagina<OrdemApi>).conteudo).toHaveLength(0)
  await expect(page.getByTestId('linha-alarme')).toHaveCount(0)
})

test('a tela da máquina mostra o ponto A em ATENÇÃO', async ({ page, request }) => {
  await entrarPelaTela(page)
  await usarFonte(page, 'simulado')
  await page.goto('/maquinas/1')
  await expect(barra(page)).toBeVisible()
  await definirNivel(request, 'ATENCAO')
  await expect(barra(page)).toHaveAttribute('data-nivel', 'ATENCAO', { timeout: 20_000 })
  await expect(page.locator('[data-estado="atencao"]').first()).toBeVisible({ timeout: 90_000 })
})

test('o ADMIN troca de nível sem sair da tela em que está', async ({ page }) => {
  await entrarPelaTela(page)
  await usarFonte(page, 'simulado')
  for (const rota of ['/', '/diagnostico', '/alarmes']) {
    await page.goto(rota)
    await expect(barra(page)).toBeVisible()
    await page.keyboard.press('1')
    await expect(botao(page, /^NORMAL/)).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('0')
    await expect(botao(page, /^Parar/)).toHaveAttribute('aria-pressed', 'true')
  }
})

// ---------------------------------------------------------------- acessibilidade (axe) nos dois temas

async function semViolacoesGraves(page: Page, tela: string) {
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

async function abrirComTema(page: Page, tema: 'grafite' | 'claro', rota = '/maquinas/1') {
  await page.addInitScript((valor) => {
    try {
      localStorage.setItem('ps.tema', valor)
    } catch {
      /* sem armazenamento */
    }
  }, tema)
  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto(rota)
  await expect(barra(page)).toBeVisible()
}

for (const tema of ['grafite', 'claro'] as const) {
  test(`axe: barra de demonstração, tema ${tema}, nos três níveis`, async ({ page }) => {
    await abrirComTema(page, tema)
    // pelos botões, sem recarregar a página: cada carga abre uma conexão ao vivo nova, e a API limita quatro por usuário
    for (const [nivel, nome] of [
      ['NORMAL', /^NORMAL/],
      ['ATENCAO', /^ATENÇÃO/],
      ['ALARME', /^ALARME/],
      ['PARADA', /^Parar/],
    ] as const) {
      await botao(page, nome).click()
      await expect(barra(page)).toHaveAttribute('data-nivel', nivel)
      await expect(botao(page, nome)).toHaveAttribute('aria-pressed', 'true')
      await semViolacoesGraves(page, `barra ${nivel} ${tema} 1920`)
    }
    // recolhida
    await botao(page, /Recolher/).click()
    await semViolacoesGraves(page, `barra recolhida ${tema} 1920`)
    await botao(page, /Abrir/).click()
    // celular
    await page.setViewportSize({ width: 390, height: 844 })
    await botao(page, /^ALARME/).click()
    await expect(barra(page)).toHaveAttribute('data-nivel', 'ALARME')
    await semViolacoesGraves(page, `barra ALARME ${tema} 390`)
  })
}

test('os botões têm 44 px ou mais de alvo de toque', async ({ page }) => {
  await abrirComTema(page, 'grafite')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(barra(page)).toBeVisible()
  for (const nome of [/^NORMAL/, /^ATENÇÃO/, /^ALARME/, /^Parar/, /Recolher/]) {
    const caixa = await botao(page, nome).boundingBox()
    expect(caixa?.height ?? 0, String(nome)).toBeGreaterThanOrEqual(44)
    expect(caixa?.width ?? 0, String(nome)).toBeGreaterThanOrEqual(44)
  }
})

// ---------------------------------------------------------------- prints

const PASTA_DOS_PRINTS = path.resolve(RAIZ_DO_REPOSITORIO, 'docs', 'evidencias', 'painel')

for (const tema of ['grafite', 'claro'] as const) {
  for (const largura of [1920, 390] as const) {
    test(`print: barra em ALARME, ${tema}, ${largura}`, async ({ page }) => {
      test.skip(process.env.PRINTS_DEMO !== '1', 'prints só com PRINTS_DEMO=1')
      mkdirSync(PASTA_DOS_PRINTS, { recursive: true })
      await page.setViewportSize({ width: largura, height: largura === 1920 ? 1080 : 844 })
      await abrirComTema(page, tema)
      await botao(page, /^ALARME/).click()
      await expect(barra(page)).toHaveAttribute('data-nivel', 'ALARME')
      // espera o ponto A chegar a alarme na tela da máquina
      await expect(page.locator('[data-estado="alarme"]').first()).toBeVisible({ timeout: 90_000 })
      await page.screenshot({
        path: path.join(PASTA_DOS_PRINTS, `demo-barra-${tema}-${largura}.png`),
      })
    })
  }
}

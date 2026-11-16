import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { test, type Page } from '@playwright/test'

import { abrirEnsaioPelaApi, encerrarPelaApi, itemDoCatalogo, liberarMaquina } from './apoio/api'
import { definirPlano, entrarPelaTela, usarFonte } from './apoio/sessao'
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
  /** Fotografa só esta região (nome acessível de uma seção). */
  regiao?: string
  /** Sem login (galeria). */
  semLogin?: boolean
}

test.describe.configure({ timeout: 150_000 })
test.skip(!ATIVO, 'prints só com PRINTS=1')

let simulador: Simulador | null = null
let ensaioDoReplay: number | null = null
test.beforeAll(async ({ request }) => {
  mkdirSync(PASTA, { recursive: true })
  await definirPlano(request, 1, [450, 900, 1120])
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

async function fotografar(page: Page, nome: string, tela: Tela) {
  // o mouse sai de cima de tudo: hover não aparece no print
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
  // aviso (toast) é passageiro e fixo na tela: numa print de página inteira ele sairia no meio da
  // página, a meio caminho de sumir. Espera os avisos irem embora (a tela de evento não depende deles)
  await page
    .locator('[data-sonner-toast]')
    .first()
    .waitFor({ state: 'detached', timeout: 12_000 })
    .catch(() => undefined)
  const arquivo = path.join(PASTA, `${nome}.png`)
  if (tela.regiao) {
    await page.getByRole('region', { name: tela.regiao, exact: true }).screenshot({ path: arquivo })
    return
  }
  await page.screenshot({ path: arquivo, fullPage: tela.inteira ?? true })
}

async function gravando(page: Page) {
  await liberarMaquina(page.request)
  const material = await itemDoCatalogo(page.request, 'materiais', 'Aço SAE 1045')
  const ferramenta = await itemDoCatalogo(
    page.request,
    'ferramentas',
    'Bit de metal duro, ângulo 60°',
  )
  await abrirEnsaioPelaApi(page.request, {
    etapa: 'T3',
    condicao: 'normal',
    rotacao_alvo_rpm: 1120,
    simulado: true,
    material_id: material,
    ferramenta_id: ferramenta,
    avanco_alvo: 0.12,
    profundidade_corte_mm: 1.5,
    diametro_peca_mm: 38,
    fluido_corte: 'emulsao',
  })
  await page.goto('/coleta')
  await page.getByTestId('gravacao').waitFor()
  await page.waitForTimeout(11_000)
}

export const TELAS: Tela[] = [
  {
    nome: 'login',
    semLogin: true,
    inteira: false,
    abrir: async (page) => {
      await page.goto('/login')
      await page.getByLabel('E-mail').waitFor()
    },
  },
  {
    nome: 'paleta',
    fonte: 'simulado',
    inteira: false,
    abrir: async (page) => {
      await page.goto('/maquinas/1')
      await page
        .getByRole('button', { name: /Comandos/ })
        .or(page.getByRole('link', { name: 'Visão geral' }))
        .first()
        .waitFor()
      await page.keyboard.press('Control+k')
      await page.getByRole('dialog', { name: 'Paleta de comandos' }).waitFor()
      await page.keyboard.type('ponto')
    },
  },
  {
    nome: 'balao',
    fonte: 'simulado',
    inteira: false,
    abrir: async (page) => {
      await page.goto('/maquinas/1')
      const botao = page.getByRole('button', { name: 'O que é RMS?' }).first()
      await botao.scrollIntoViewIfNeeded()
      await botao.click()
      await page.getByTestId('balao-explica').waitFor()
      await page.waitForTimeout(400)
    },
  },
  {
    nome: 'diagnostico',
    fonte: 'simulado',
    abrir: async (page) => {
      await itemDoCatalogo(page.request, 'materiais', 'Aço SAE 1045')
      await itemDoCatalogo(page.request, 'materiais', 'aço sae 1045 trefilado')
      await page.goto('/diagnostico')
      await page.getByTestId('tabela-usuarios').waitFor()
      await page.waitForTimeout(1000)
    },
  },
  {
    nome: 'alarmes',
    abrir: async (page) => {
      await page.goto('/alarmes')
      await page.getByText('A regra de alarme ainda não foi implantada na API.').waitFor()
    },
  },
  {
    nome: 'galeria-alarmes',
    semLogin: true,
    regiao: 'Alarmes e ordens de serviço',
    abrir: async (page) => {
      await page.goto('/galeria.html')
      await page.getByRole('region', { name: 'Alarmes e ordens de serviço', exact: true }).waitFor()
    },
  },
  {
    nome: 'replay',
    fonte: 'simulado',
    abrir: async (page) => {
      // um ensaio com janelas, gravado uma vez para todas as variações (o primeiro da lista pode
      // ser um ensaio sem janelas criado pelos piores casos)
      if (!ensaioDoReplay) {
        await liberarMaquina(page.request)
        const e = await abrirEnsaioPelaApi(page.request, {
          etapa: 'T1',
          condicao: 'normal',
          rotacao_alvo_rpm: 1120,
          simulado: true,
        })
        await page.waitForTimeout(25_000)
        await encerrarPelaApi(page.request, e.id)
        ensaioDoReplay = e.id
      }
      await page.goto(`/coleta/ensaios/${String(ensaioDoReplay)}/replay`)
      await page.getByTestId('replay').waitFor()
      await page.getByRole('button', { name: 'Velocidade 4 vezes' }).click()
      await page.getByRole('button', { name: 'Tocar' }).click()
      await page.waitForTimeout(2500)
      await page.getByRole('button', { name: 'Pausar' }).click()
    },
  },
  {
    nome: 'coleta-gravando',
    fonte: 'simulado',
    inteira: false,
    abrir: gravando,
  },
  {
    nome: 'coleta-evento',
    fonte: 'simulado',
    inteira: false,
    abrir: async (page) => {
      await gravando(page)
      await page
        .getByRole('button', { name: /Marcar evento/ })
        .filter({ visible: true })
        .click()
      await page.getByTestId('painel-evento').waitFor()
      await page.getByTestId('painel-evento').scrollIntoViewIfNeeded()
    },
  },
  {
    nome: 'coleta-resumo',
    fonte: 'simulado',
    abrir: async (page) => {
      await gravando(page)
      await page.getByRole('button', { name: 'Encerrar' }).filter({ visible: true }).click()
      await page.getByTestId('resumo-gravacao').waitFor()
      await page.waitForTimeout(1200)
    },
  },
  {
    nome: 'coleta-ensaios',
    fonte: 'simulado',
    abrir: async (page) => {
      await liberarMaquina(page.request)
      const e = await abrirEnsaioPelaApi(page.request, {
        etapa: 'T3',
        condicao: 'avanco_excessivo',
        rotacao_alvo_rpm: 1120,
        avanco_alvo: 0.15,
        simulado: true,
      })
      await encerrarPelaApi(page.request, e.id)
      await page.goto(`/coleta/ensaios?maquina=1&ensaio=${e.id}`)
      const linha = page.locator(`[data-ensaio="${e.codigo}"]`)
      await linha.getByRole('button', { name: 'Corrigir receita' }).click()
      await linha.getByLabel('Avanço').fill('0,1')
      await linha.getByRole('button', { name: 'Gravar correção' }).click()
      await linha.getByTestId('historico').waitFor()
      await page.waitForTimeout(600)
    },
  },
  {
    nome: 'coleta-entrada',
    fonte: 'simulado',
    abrir: async (page) => {
      await page.goto('/coleta')
      await page.getByTestId('matriz-cobertura').waitFor()
      await page.waitForTimeout(800)
    },
  },
  {
    nome: 'coleta-preparar',
    fonte: 'simulado',
    inteira: false,
    abrir: async (page) => {
      await page.goto('/coleta/preparar?maquina=1&etapa=T3&condicao=normal&rotacao=1120')
      await page.getByRole('heading', { name: /Preparar/ }).waitFor()
      await page.waitForTimeout(800)
    },
  },
  {
    nome: 'coleta-preparar-inteira',
    fonte: 'simulado',
    abrir: async (page) => {
      await page.goto('/coleta/preparar?maquina=1&etapa=T3&condicao=normal&rotacao=1120')
      await page.getByRole('heading', { name: /Preparar/ }).waitFor()
      await page.waitForTimeout(800)
    },
  },
  {
    nome: 'coleta-receita',
    fonte: 'simulado',
    inteira: false,
    abrir: async (page) => {
      await page.goto('/coleta/preparar?maquina=1&etapa=T3&condicao=normal&rotacao=1120')
      await page.getByRole('heading', { name: /Preparar/ }).waitFor()
      const passo = page.getByRole('button', { name: '2 Receita', exact: true })
      if (await passo.isVisible()) await passo.click()
      await page.getByLabel('Material').fill('aço 1045')
      await page.waitForTimeout(800)
    },
  },
  {
    nome: 'coleta-checagem',
    fonte: 'simulado',
    inteira: false,
    abrir: async (page) => {
      await page.goto('/coleta/preparar?maquina=1&etapa=T3&condicao=normal&rotacao=1120')
      await page.getByRole('heading', { name: /Preparar/ }).waitFor()
      const passo = page.getByRole('button', { name: '3 Checagem', exact: true })
      if (await passo.isVisible()) await passo.click()
      await page.waitForTimeout(1500)
    },
  },
  {
    nome: 'galeria-mapa',
    semLogin: true,
    regiao: 'Mapa de ordens',
    abrir: async (page) => {
      await page.goto('/galeria.html')
      await page.getByRole('region', { name: 'Mapa de ordens', exact: true }).waitFor()
      await page.waitForTimeout(800)
    },
  },
  {
    nome: 'galeria',
    semLogin: true,
    abrir: async (page) => {
      await page.goto('/galeria.html')
      await page.waitForTimeout(1500)
    },
  },
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
  // Dado velho: rodar com o simulador parado (TELAS=l1-velho,l2-velho,l3-velho PRINTS_SIMULADOR=0)
  ...(['l1-velho', 'l2-velho', 'l3-velho'] as const).map((nome): Tela => ({
    nome,
    fonte: 'simulado',
    abrir: async (page) => {
      await page.goto(
        { 'l1-velho': '/', 'l2-velho': '/maquinas/1', 'l3-velho': '/maquinas/1/pontos/B' }[nome],
      )
      await page.waitForTimeout(3000)
    },
  })),
  // Fonte real sem medição gravada: estado vazio honesto
  ...(['l1-real', 'l2-real'] as const).map((nome): Tela => ({
    nome,
    fonte: 'real',
    abrir: async (page) => {
      await page.goto({ 'l1-real': '/', 'l2-real': '/maquinas/1' }[nome])
      await page.waitForTimeout(3000)
    },
  })),
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
        if (!tela.semLogin) await entrarPelaTela(page)
        await tela.abrir(page)
        await fotografar(page, `${tela.nome}-${tema}-${largura.nome}`, tela)
      })
    }
  }
}

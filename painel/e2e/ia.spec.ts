import { expect, test, type APIRequestContext } from '@playwright/test'

import { URL_API } from './apoio/ambiente'
import { entrarPelaTela, tokenDoAdmin, usarFonte } from './apoio/sessao'
import { executarRoteiro, ligarSimulador, type Simulador } from './apoio/simulador'

/**
 * Fluxo da segunda opinião, com DADO SIMULADO (prova o encadeamento, não a detecção real): gravar o conjunto
 * (roteiro acelerado) → Treinar pela tela → trabalho concluído → Ativar → simulador com avanço excessivo → alerta
 * com a segunda opinião → OS → concluir CONFIRMADA com a condição encontrada.
 * Precisa: API com o perfil de tempos curtos e o serviço de treino do compose
 *   ($env:PERFIL_API = "tempos-curtos"; docker compose --profile treino up -d), com TREINO_URL=http://treino:8090.
 */

type Pagina<T> = { conteudo: T[] }
type AlertaApi = { id: number; tipo: string; opiniao_abertura: { versao: number } | null }
type OrdemApi = { id: number; status: string }

async function api<T>(request: APIRequestContext, token: string, metodo: 'GET' | 'POST', caminho: string): Promise<T> {
  const resposta = await request.fetch(`${URL_API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(resposta.ok(), caminho).toBeTruthy()
  return (await resposta.json()) as T
}

let simulador: Simulador | null = null
test.afterEach(() => {
  simulador?.parar()
  simulador = null
})

test('treinar, ativar e ver a segunda opinião no alerta e na OS', async ({ page, request }) => {
  test.setTimeout(15 * 60_000)
  const token = await tokenDoAdmin(request)
  // conjunto: normal (T1 e T3) e as 4 condições no corte, 2 ensaios de cada, 1120 rpm. Período próprio no passado
  // (entre 3 e 9 dias atrás), para não cruzar com janelas já gravadas no banco local
  const inicio = Date.now() - (3 + Math.floor(Math.random() * 6)) * 86_400_000 - Math.floor(Math.random() * 40_000) * 1000
  const em = (deslocamentoH: number) => new Date(inicio + deslocamentoH * 3_600_000).toISOString()
  executarRoteiro(['--etapas', 'T0,T1,T3', '--condicoes', 'normal', '--rotacoes', '1120', '--janelas', '30',
    '--repeticoes', '2', '--material', 'aço 1045', '--ferramenta', 'bit de metal duro', '--inicio', em(0)])
  executarRoteiro(['--etapas', 'T3', '--condicoes', 'avanco_excessivo,rotacao_inadequada,ferramenta_desgastada,'
    + 'desbalanceamento', '--rotacoes', '1120', '--janelas', '30', '--repeticoes', '2', '--material', 'aço 1045',
    '--ferramenta', 'bit de metal duro', '--inicio', em(2)])
  await api(request, token, 'POST', '/api/v1/maquinas/1/referencias/recalcular?simulado=true')

  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto('/coleta/modelos')
  await page.getByRole('button', { name: 'Treinar' }).click()
  // progresso ao vivo pelo evento "treino": acordando → treinando → concluído
  await expect(page.getByRole('region', { name: 'Treino' }).getByText('concluído')).toBeVisible({
    timeout: 8 * 60_000,
  })
  await page.getByRole('list', { name: 'Versões do modelo' }).getByRole('button').first().click()
  await expect(page.getByText('dado simulado: não é resultado').first()).toBeVisible()
  await expect(page.getByRole('table', { name: 'Matriz de confusão' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Ativar' }).click()
  await expect(page.getByRole('group', { name: 'Comparação com a versão ativa' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar ativação' }).click()
  await expect(page.getByText('● ativa').first()).toBeVisible({ timeout: 15_000 })

  // a regra abre o alerta; o modelo acrescenta a segunda opinião
  simulador = ligarSimulador(['--condicao', 'avanco_excessivo', '--rotacao', '1120'])
  let alerta: AlertaApi | undefined
  await expect
    .poll(
      async () => {
        const lista = await api<Pagina<AlertaApi>>(request, token, 'GET', '/api/v1/alertas?simulado=true&size=20')
        alerta = lista.conteudo.find((a) => a.tipo === 'maquina' && a.opiniao_abertura !== null)
        return alerta !== undefined
      },
      { timeout: 4 * 60_000, intervals: [5_000] },
    )
    .toBe(true)
  await page.goto(`/alarmes/${String(alerta?.id)}`)
  const opiniao = page.getByRole('region', { name: 'Segunda opinião' })
  await expect(opiniao.getByText('Na abertura')).toBeVisible()
  await expect(opiniao.getByText(/versão \d+/).first()).toBeVisible()

  let os: OrdemApi | undefined
  await expect
    .poll(
      async () => {
        const lista = await api<Pagina<OrdemApi>>(request, token, 'GET', '/api/v1/ordens-servico?simulado=true&size=5')
        os = lista.conteudo.find((o) => o.status === 'aberta' || o.status === 'em_andamento')
        return os !== undefined
      },
      { timeout: 6 * 60_000, intervals: [5_000] },
    )
    .toBe(true)
  simulador.parar()
  await page.goto(`/ordens/${String(os?.id)}`)
  await page.getByLabel('confirmada: havia problema').check()
  await page.getByLabel('Condição encontrada (opcional)').selectOption('avanco_excessivo')
  await page.getByRole('button', { name: 'Concluir OS' }).click()
  await expect(page.getByText('encontrado: avanço excessivo').first()).toBeVisible({ timeout: 15_000 })
})

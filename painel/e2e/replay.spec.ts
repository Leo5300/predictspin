import { expect, test } from '@playwright/test'

import {
  abrirEnsaioPelaApi,
  encerrarPelaApi,
  liberarMaquina,
  marcarEventoPelaApi,
} from './apoio/api'
import { entrarPelaTela, usarFonte } from './apoio/sessao'
import { ligarSimulador } from './apoio/simulador'

/** Replay de um ensaio gravado com o simulador (dados SIMULADOS), contra o compose local. */
test('replay: toca, pausa, 16×, chega ao fim e mostra o evento na linha do tempo', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await liberarMaquina(request)
  const simulador = ligarSimulador()
  let ensaio: { id: number; codigo: string }
  try {
    ensaio = await abrirEnsaioPelaApi(request, {
      etapa: 'T1',
      condicao: 'normal',
      rotacao_alvo_rpm: 1120,
      simulado: true,
    })
    await page.waitForTimeout(8_000)
    await marcarEventoPelaApi(request, ensaio.id, 'cavaco')
    await page.waitForTimeout(9_000)
    await encerrarPelaApi(request, ensaio.id)
  } finally {
    simulador.parar()
  }

  await usarFonte(page, 'simulado')
  await entrarPelaTela(page)
  await page.goto(`/coleta/ensaios?maquina=1`)
  await page.getByRole('link', { name: `Replay do ensaio ${ensaio.codigo}` }).click()

  // faixa permanente e barra superior dizendo REPLAY; nada de "última janela há X s"
  await expect(page.getByTestId('faixa-replay')).toContainText('REPLAY')
  await expect(page.getByTestId('faixa-replay')).toContainText(ensaio.codigo)
  await expect(page.getByTestId('ultima-janela')).toHaveText('REPLAY')
  await expect(page.getByTestId('evento-na-linha')).toHaveCount(1)

  const tempo = page.getByTestId('tempo-replay')
  await expect(tempo).toHaveText(/^0:00 \//)
  await page.getByRole('button', { name: 'Tocar' }).click()
  await expect(tempo).not.toHaveText(/^0:00 \//, { timeout: 5_000 })
  await page.getByRole('button', { name: 'Pausar' }).click()
  const pausado = await tempo.innerText()
  await page.waitForTimeout(1_500)
  await expect(tempo).toHaveText(pausado)

  // 16×: chega ao fim e para sozinho
  await page.getByRole('button', { name: 'Velocidade 16 vezes' }).click()
  await page.getByRole('button', { name: 'Tocar' }).click()
  await expect(page.getByRole('button', { name: 'Tocar do início' })).toBeVisible({
    timeout: 10_000,
  })
  const [atual, total] = (await tempo.innerText()).split(' / ')
  expect(atual).toBe(total)

  // cursor arrastável (slider) pelo teclado
  const cursor = page.getByRole('slider', { name: 'Posição no replay' })
  await cursor.focus()
  await page.keyboard.press('Home')
  await expect(tempo).toHaveText(/^0:00 \//)
})

import { expect, type APIRequestContext } from '@playwright/test'

import { URL_API } from './ambiente'
import { tokenDoAdmin } from './sessao'

/**
 * Chamadas diretas à API LOCAL para preparar o terreno dos testes (nunca a publicada). Tudo como
 * ADMIN; nenhum valor de credencial é impresso.
 */
async function cabecalho(request: APIRequestContext) {
  return { Authorization: `Bearer ${await tokenDoAdmin(request)}` }
}

export async function ensaioAberto(request: APIRequestContext, maquinaId = 1) {
  const r = await request.get(
    `${URL_API}/api/v1/maquinas/${maquinaId}/ensaios?aberto=true&size=1`,
    {
      headers: await cabecalho(request),
    },
  )
  expect(r.ok()).toBeTruthy()
  const corpo = (await r.json()) as { conteudo: { id: number; codigo: string }[] }
  return corpo.conteudo[0] ?? null
}

/** Descarta o ensaio aberto na máquina, se houver (deixa o terreno livre para o teste). */
export async function liberarMaquina(request: APIRequestContext, maquinaId = 1) {
  const aberto = await ensaioAberto(request, maquinaId)
  if (!aberto) return
  await request.post(`${URL_API}/api/v1/ensaios/${aberto.id}/descartar`, {
    headers: await cabecalho(request),
  })
}

export async function abrirEnsaioPelaApi(
  request: APIRequestContext,
  corpo: Record<string, unknown>,
  maquinaId = 1,
): Promise<{ id: number; codigo: string }> {
  const r = await request.post(`${URL_API}/api/v1/maquinas/${maquinaId}/ensaios`, {
    headers: await cabecalho(request),
    data: corpo,
  })
  expect(r.status()).toBe(201)
  return (await r.json()) as { id: number; codigo: string }
}

export async function encerrarPelaApi(request: APIRequestContext, ensaioId: number) {
  const r = await request.post(`${URL_API}/api/v1/ensaios/${ensaioId}/encerrar`, {
    headers: await cabecalho(request),
  })
  expect(r.ok()).toBeTruthy()
}

/** Cria (ou acha, se já existir) um item de catálogo e devolve o id. */
export async function itemDoCatalogo(
  request: APIRequestContext,
  tipo: 'materiais' | 'ferramentas',
  nome: string,
): Promise<number> {
  const r = await request.post(`${URL_API}/api/v1/${tipo}`, {
    headers: await cabecalho(request),
    data: { nome },
  })
  const corpo = (await r.json()) as { id?: number; existente?: { id: number } }
  if (r.status() === 409 && corpo.existente) return corpo.existente.id
  expect(r.status()).toBe(201)
  return corpo.id as number
}

import { expect, type APIRequestContext, type Page } from '@playwright/test'

import { ADMIN, URL_API } from './ambiente'

export type Credenciais = { email: string; senha: string }

/** Entra pela tela de login, como uma pessoa faria. */
export async function entrarPelaTela(page: Page, credenciais: Credenciais = ADMIN) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(credenciais.email)
  await page.getByLabel('Senha').fill(credenciais.senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

/** Define a fonte dos dados (Real ou Simulado) antes de a página carregar. */
export async function usarFonte(page: Page, fonte: 'real' | 'simulado') {
  await page.addInitScript((valor) => {
    try {
      localStorage.setItem('ps.fonte', valor)
    } catch {
      /* sem armazenamento: fica no padrão */
    }
  }, fonte)
}

/**
 * Falhas de login contam por IP na API. Para os testes de senha errada e de 429 não bloquearem o
 * computador de quem roda a suíte, cada um desses testes se apresenta com um IP próprio (a API,
 * atrás de proxy, lê o X-Forwarded-For).
 */
export async function loginComIpProprio(page: Page) {
  const ip = `10.${rand()}.${rand()}.${rand()}`
  await page.route('**/api/v1/auth/login', (rota) =>
    rota.continue({ headers: { ...rota.request().headers(), 'x-forwarded-for': ip } }),
  )
}

const rand = () => Math.floor(Math.random() * 250) + 1

async function tokenDoAdmin(request: APIRequestContext): Promise<string> {
  const resposta = await request.post(`${URL_API}/api/v1/auth/login`, { data: ADMIN })
  expect(resposta.ok()).toBeTruthy()
  const corpo = (await resposta.json()) as { token: string }
  return corpo.token
}

/** Cria um usuário OPERADOR descartável pela API (como ADMIN) e devolve as credenciais e o id. */
export async function criarOperador(
  request: APIRequestContext,
): Promise<Credenciais & { id: number }> {
  const token = await tokenDoAdmin(request)
  const sufixo = `${Date.now()}${rand()}`
  const credenciais = { email: `operador.e2e.${sufixo}@exemplo.com`, senha: `Operador-${sufixo}` }
  const resposta = await request.post(`${URL_API}/api/v1/usuarios`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { nome: 'Operador de teste', papel: 'OPERADOR', ...credenciais },
  })
  expect(resposta.status()).toBe(201)
  const corpo = (await resposta.json()) as { id: number }
  return { ...credenciais, id: corpo.id }
}

export async function desativarUsuario(request: APIRequestContext, id: number) {
  const token = await tokenDoAdmin(request)
  await request.post(`${URL_API}/api/v1/usuarios/${id}/desativar`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

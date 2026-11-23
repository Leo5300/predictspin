/**
 * Fumaça do app contra a API LOCAL do docker compose, com o mesmo cliente que o app usa
 * (openapi-fetch, tipado pelo esquema gerado de painel/openapi.json): entra, lê a máquina, lê os
 * alarmes simulados e reconhece um alarme simulado. Uma execução; não mede tempo.
 *
 * Antes: docker compose up -d e o simulador rodando (dado simulado; com referência e modo severo
 * para existir alarme a reconhecer).
 *
 * Uso: node scripts/fumaca.mjs [--url http://localhost:8080]
 * Credenciais: ADMIN_EMAIL e ADMIN_SENHA do ambiente ou do .env da raiz (nunca impressas).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import createClient from 'openapi-fetch'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function lerEnv(nome) {
  if (process.env[nome]) return process.env[nome]
  const arquivo = resolve(raiz, '.env')
  if (!existsSync(arquivo)) return undefined
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha)
    if (m && m[1] === nome) return m[2].replace(/^["']|["']$/g, '')
  }
  return undefined
}

const indice = process.argv.indexOf('--url')
const url = (indice > 0 ? process.argv[indice + 1] : 'http://localhost:8080').replace(/\/+$/, '')
const host = new URL(url).hostname
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error('A fumaça só roda contra a API local (localhost). Nada contra a API publicada.')
  process.exit(2)
}

const email = lerEnv('ADMIN_EMAIL')
const senha = lerEnv('ADMIN_SENHA')
if (!email || !senha) {
  console.error('Faltam ADMIN_EMAIL e ADMIN_SENHA (ambiente ou .env da raiz).')
  process.exit(2)
}

/** @type {import('openapi-fetch').Client<import('../src/api/esquema').paths>} */
const api = createClient({ baseUrl: url })

let falhas = 0
function passo(nome, ok, detalhe = '') {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? `: ${detalhe}` : ''}`)
  if (!ok) falhas += 1
}

const login = await api.POST('/api/v1/auth/login', { body: { email, senha } })
passo('entrar', login.response.ok, `HTTP ${login.response.status}, papel ${login.data?.usuario.papel ?? '-'}`)
if (!login.data) process.exit(1)
const headers = { Authorization: `Bearer ${login.data.token}` }

const eu = await api.GET('/api/v1/auth/eu', { headers })
passo('quem sou eu', eu.response.ok, `HTTP ${eu.response.status}`)

const maquinas = await api.GET('/api/v1/maquinas', { headers, params: { query: { size: 200 } } })
const maquina = maquinas.data?.conteudo[0]
passo('ler máquinas', Boolean(maquina), `${maquinas.data?.conteudo.length ?? 0} máquina(s), primeira ${maquina?.codigo ?? '-'}`)
if (!maquina) process.exit(1)

const ultima = await api.GET('/api/v1/maquinas/{id}/ultima-janela', {
  headers,
  params: { path: { id: maquina.id }, query: { simulado: true } },
})
passo(
  'ler última janela simulada',
  ultima.response.ok,
  ultima.data
    ? `há ${ultima.data.segundos_desde_recebimento} s, ${Object.keys(ultima.data.pontos).sort().join(',')}, ${Math.round(ultima.data.rotacao_rpm)} rpm`
    : `HTTP ${ultima.response.status}`,
)

const alertas = await api.GET('/api/v1/alertas', {
  headers,
  params: { query: { simulado: true, size: 100 } },
})
const lista = alertas.data?.conteudo ?? []
passo('ler alarmes simulados', alertas.response.ok, `${lista.length} alarme(s)`)

const alvo = lista.find(
  (a) => a.simulado && (a.estado === 'ativo_nao_reconhecido' || a.estado === 'normalizado_nao_reconhecido'),
)
if (!alvo) {
  passo('reconhecer alarme simulado', false, 'nenhum alarme simulado à espera de reconhecimento')
} else {
  const r = await api.POST('/api/v1/alertas/{id}/reconhecer', { headers, params: { path: { id: alvo.id } } })
  passo(
    'reconhecer alarme simulado',
    r.response.ok && r.data?.estado !== alvo.estado,
    `alarme ${alvo.id} (ponto ${alvo.ponto}): ${alvo.estado} -> ${r.data?.estado ?? `HTTP ${r.response.status}`}`,
  )
}

console.log(falhas === 0 ? 'Fumaça: tudo certo.' : `Fumaça: ${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)

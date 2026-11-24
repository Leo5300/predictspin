/**
 * Fumaça do app contra a API LOCAL do docker compose, com o mesmo cliente que o app usa
 * (openapi-fetch, tipado pelo esquema gerado de painel/openapi.json): entra, lê a máquina, lê os
 * alarmes simulados, reconhece um alarme simulado, abre e encerra um ensaio SIMULADO (T1, normal) e
 * assume e conclui uma OS SIMULADA (retorno "rejeitada": é fumaça, não diagnóstico). Uma execução;
 * não mede tempo. Nunca toca em ensaio ou OS de dado real.
 *
 * Antes: docker compose up -d e o simulador rodando (dado simulado; com referência e modo severo
 * para existir alarme a reconhecer e OS aberta: a OS abre depois de 120 s seguidos em ALARME).
 *
 * Uso: node scripts/fumaca.mjs [--url http://localhost:8080] [--espera-ensaio 12]
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

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}
const url = argumento('--url', 'http://localhost:8080').replace(/\/+$/, '')
const esperaEnsaioS = Number(argumento('--espera-ensaio', '12'))
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

// ------------------------------------------------------------ coleta: ensaio simulado
const aberto = await api.GET('/api/v1/maquinas/{id}/ensaios', {
  headers,
  params: { path: { id: maquina.id }, query: { aberto: true, size: 1 } },
})
const jaAberto = aberto.data?.conteudo[0]
if (!aberto.response.ok) {
  passo('ler ensaio aberto', false, `HTTP ${aberto.response.status}`)
} else if (jaAberto) {
  // só um ensaio aberto por máquina: não encerra o de outra pessoa
  passo('abrir ensaio simulado', false, `já há ensaio aberto (${jaAberto.codigo}, ${jaAberto.simulado ? 'simulado' : 'REAL'}); nada feito`)
} else {
  const nominais = (maquina.rotacoes_nominais_rpm ?? []).filter((r) => r > 0)
  const rpm = ultima.data?.rotacao_rpm ?? 0
  const rotacao = nominais.length
    ? nominais.reduce((a, b) => (Math.abs(b - rpm) < Math.abs(a - rpm) ? b : a))
    : Math.max(1, Math.round(rpm))
  const novo = await api.POST('/api/v1/maquinas/{id}/ensaios', {
    headers,
    params: { path: { id: maquina.id } },
    body: { etapa: 'T1', condicao: 'normal', rotacao_alvo_rpm: rotacao, simulado: true, observacao: 'Fumaça do app (scripts/fumaca.mjs)' },
  })
  const e = novo.data
  passo(
    'abrir ensaio simulado',
    novo.response.status === 201 && Boolean(e?.aberto) && e?.simulado === true,
    e ? `${e.codigo}, T1 normal a ${e.rotacao_alvo_rpm} rpm, simulado=${e.simulado}` : `HTTP ${novo.response.status}`,
  )
  if (e) {
    const recusa = await api.POST('/api/v1/maquinas/{id}/ensaios', {
      headers,
      params: { path: { id: maquina.id } },
      body: { etapa: 'T1', condicao: 'normal', rotacao_alvo_rpm: rotacao, simulado: true },
    })
    passo('segundo ensaio na mesma máquina é recusado', recusa.response.status === 409, `HTTP ${recusa.response.status}`)

    await new Promise((r) => setTimeout(r, esperaEnsaioS * 1000))
    const evento = await api.POST('/api/v1/ensaios/{id}/eventos', {
      headers,
      params: { path: { id: e.id } },
      body: { motivo: 'outro', ocorrido_em: new Date().toISOString(), nota: 'fumaça' },
    })
    passo('marcar evento', evento.response.ok, `HTTP ${evento.response.status}`)

    const fim = await api.POST('/api/v1/ensaios/{id}/encerrar', { headers, params: { path: { id: e.id } } })
    passo('encerrar ensaio simulado', fim.response.ok && fim.data?.aberto === false, fim.data ? `encerrado em ${fim.data.encerrado_em}` : `HTTP ${fim.response.status}`)
    const resumo = await api.GET('/api/v1/ensaios/{id}/resumo', { headers, params: { path: { id: e.id } } })
    passo(
      'resumo do ensaio',
      resumo.response.ok,
      resumo.data ? `${resumo.data.janelas} janela(s), ${resumo.data.janelas_saturadas} saturada(s), ${Math.round(resumo.data.duracao_segundos)} s` : `HTTP ${resumo.response.status}`,
    )
  }
}

// ------------------------------------------------------------ OS simulada
const ordens = await api.GET('/api/v1/ordens-servico', {
  headers,
  params: { query: { simulado: true, status: 'aberta', size: 50 } },
})
const os = (ordens.data?.conteudo ?? []).find((o) => o.simulado && o.status === 'aberta')
if (!ordens.response.ok) {
  passo('ler OS simuladas abertas', false, `HTTP ${ordens.response.status}`)
} else if (!os) {
  passo('assumir OS simulada', false, 'nenhuma OS simulada aberta (rode o simulador em modo severo por uns 3 min)')
} else {
  const assumida = await api.POST('/api/v1/ordens-servico/{id}/assumir', { headers, params: { path: { id: os.id } } })
  passo(
    'assumir OS simulada',
    assumida.response.ok && assumida.data?.status === 'em_andamento',
    `${os.numero} (ponto ${os.ponto}): ${os.status} -> ${assumida.data?.status ?? `HTTP ${assumida.response.status}`}`,
  )
  const concluida = await api.POST('/api/v1/ordens-servico/{id}/concluir', {
    headers,
    params: { path: { id: os.id } },
    body: { retorno: 'rejeitada', comentario: 'Fumaça do app (scripts/fumaca.mjs): dado simulado.' },
  })
  passo(
    'concluir OS simulada',
    concluida.response.ok && concluida.data?.status === 'concluida',
    `${os.numero}: -> ${concluida.data?.status ?? `HTTP ${concluida.response.status}`}, retorno ${concluida.data?.retorno_tecnico ?? '-'}`,
  )
}

console.log(falhas === 0 ? 'Fumaça: tudo certo.' : `Fumaça: ${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)

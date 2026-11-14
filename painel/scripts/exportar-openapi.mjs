// Exporta o documento OpenAPI da API local para painel/openapi.json (arquivo versionado).
//
//   npm run api:exportar            grava openapi.json
//   npm run api:conferir            falha se o arquivo versionado estiver defasado da API local
//
// O cliente do painel (src/api/esquema.d.ts) é gerado a partir desse arquivo. As chaves são
// ordenadas para que duas exportações da mesma API deem exatamente o mesmo arquivo.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ARQUIVO = fileURLToPath(new URL('../openapi.json', import.meta.url))
const API = (process.env.PAINEL_API_LOCAL ?? 'http://localhost:8080').replace(/\/+$/, '')

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  console.error(`O contrato é exportado da API local; "${API}" não é local.`)
  process.exit(2)
}

function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar)
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map((chave) => [chave, ordenar(valor[chave])]),
    )
  }
  return valor
}

async function baixar() {
  let resposta
  try {
    resposta = await fetch(`${API}/v3/api-docs`)
  } catch {
    console.error(
      `API local fora do ar em ${API}. Suba com "docker compose up -d" na raiz do repositório.`,
    )
    process.exit(2)
  }
  if (!resposta.ok) {
    console.error(`${API}/v3/api-docs respondeu ${resposta.status}.`)
    process.exit(2)
  }
  const documento = await resposta.json()
  // o endereço do servidor muda conforme de onde a API é chamada; não faz parte do contrato
  delete documento.servers
  return `${JSON.stringify(ordenar(documento), null, 2)}\n`
}

const atual = await baixar()

if (process.argv.includes('--conferir')) {
  const versionado = await readFile(ARQUIVO, 'utf8').catch(() => '')
  if (versionado.replaceAll('\r\n', '\n') !== atual) {
    console.error(
      'painel/openapi.json está defasado da API local. Rode "npm run api:gerar" e versione o resultado.',
    )
    process.exit(1)
  }
  console.log('painel/openapi.json confere com a API local.')
} else {
  await writeFile(ARQUIVO, atual, 'utf8')
  console.log(`Contrato exportado de ${API} para painel/openapi.json.`)
}

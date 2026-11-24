/**
 * Gera src/api/enumeracoes.ts com os valores que a API aceita em campos de escolha, lidos do contrato
 * (painel/openapi.json). O esquema de tipos só existe na compilação; as telas precisam dos valores para
 * montar as opções, e eles não podem ser uma lista escrita à mão no app.
 *
 *   node scripts/gerar-enumeracoes.mjs              grava o arquivo (faz parte de "npm run api:tipos")
 *   node scripts/gerar-enumeracoes.mjs --conferir   falha se o arquivo não bate com o contrato
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRATO = join(raiz, '..', 'painel', 'openapi.json')
const SAIDA = join(raiz, 'src', 'api', 'enumeracoes.ts')

/** Constante exportada → esquema e propriedade do contrato. */
const ENUMERACOES = [
  ['CONDICOES_ENCONTRADAS', 'ConclusaoRequisicao', 'condicao_encontrada'],
  ['RETORNOS_TECNICOS', 'ConclusaoRequisicao', 'retorno'],
  ['ETAPAS', 'NovoEnsaioRequisicao', 'etapa'],
  ['CONDICOES_DE_ENSAIO', 'NovoEnsaioRequisicao', 'condicao'],
  ['MOTIVOS_DE_EVENTO', 'NovoEventoMarcadoRequisicao', 'motivo'],
]

const esquemas = JSON.parse(readFileSync(CONTRATO, 'utf8')).components.schemas
const linhas = [
  '// Gerado por scripts/gerar-enumeracoes.mjs a partir de painel/openapi.json. Não edite à mão:',
  '// rode "npm run api:tipos" depois de regenerar o contrato.',
  '',
]
for (const [nome, esquema, propriedade] of ENUMERACOES) {
  const valores = esquemas[esquema]?.properties?.[propriedade]?.enum?.filter((v) => v !== null)
  if (!valores?.length) {
    console.error(`${esquema}.${propriedade} não tem enum no contrato.`)
    process.exit(1)
  }
  linhas.push(`/** ${esquema}.${propriedade} */`)
  linhas.push(`export const ${nome} = [${valores.map((v) => `'${v}'`).join(', ')}] as const`)
  linhas.push('')
}
const texto = linhas.join('\n')

if (process.argv.includes('--conferir')) {
  const atual = readFileSync(SAIDA, 'utf8').replace(/\r\n/g, '\n')
  if (atual !== texto) {
    console.error('src/api/enumeracoes.ts não bate com painel/openapi.json. Rode "npm run api:tipos".')
    process.exit(1)
  }
  console.log('Enumerações do app conferem com o contrato da API.')
} else {
  writeFileSync(SAIDA, texto)
}

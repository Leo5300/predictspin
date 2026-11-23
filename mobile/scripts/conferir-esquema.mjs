/**
 * Confere se src/api/esquema.d.ts foi gerado do contrato atual (painel/openapi.json), com o mesmo
 * gerador do painel. Se a API mudou e o contrato foi regenerado, o app precisa de "npm run api:tipos";
 * a checagem de tipos então mostra o que quebrou.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pasta = mkdtempSync(join(tmpdir(), 'esquema-'))
const gerado = join(pasta, 'esquema.d.ts')
try {
  const cli = join(raiz, 'node_modules', 'openapi-typescript', 'bin', 'cli.js')
  execFileSync(process.execPath, [cli, join(raiz, '..', 'painel', 'openapi.json'), '-o', gerado], { stdio: 'pipe' })
  const normal = (t) => t.replace(/\r\n/g, '\n')
  const versionado = normal(readFileSync(join(raiz, 'src', 'api', 'esquema.d.ts'), 'utf8'))
  if (normal(readFileSync(gerado, 'utf8')) !== versionado) {
    console.error('src/api/esquema.d.ts não bate com painel/openapi.json. Rode "npm run api:tipos".')
    process.exit(1)
  }
  console.log('Esquema do app confere com o contrato da API (painel/openapi.json).')
} finally {
  rmSync(pasta, { recursive: true, force: true })
}

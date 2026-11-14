// Lança o Vitest com o diretório do painel normalizado. No Windows, um terminal em "c:\..." e outro em
// "C:\..." fazem o Node carregar o Vitest duas vezes, e os testes deixam de enxergar o executor
// ("failed to find the current suite"). Aqui a letra do drive vai sempre em maiúscula.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const normalizar = (caminho) => caminho.replace(/^[a-z]:/, (drive) => drive.toUpperCase())
const raiz = normalizar(path.resolve(fileURLToPath(new URL('..', import.meta.url))))
const executavel = path.join(raiz, 'node_modules', 'vitest', 'vitest.mjs')

const resultado = spawnSync(process.execPath, [normalizar(executavel), ...process.argv.slice(2)], {
  cwd: raiz,
  stdio: 'inherit',
})
process.exit(resultado.status ?? 1)

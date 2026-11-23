/**
 * Confere o bundle de produção exportado (npx expo export --platform android --no-bytecode): a
 * galeria de estados (só desenvolvimento) não pode estar dentro, nem cor OKLCH dos tokens.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const pasta = join(process.argv[2] ?? 'dist', '_expo', 'static', 'js', 'android')
const arquivos = readdirSync(pasta).filter((a) => a.endsWith('.js'))
if (arquivos.length === 0) {
  console.error(`Nenhum bundle JavaScript em ${pasta}. Exporte com --no-bytecode.`)
  process.exit(1)
}
const texto = arquivos.map((a) => readFileSync(join(pasta, a), 'utf8')).join('\n')
const problemas = []
if (texto.includes('galeria-de-estados-so-desenvolvimento')) problemas.push('a galeria de estados está no bundle de produção')
if (texto.includes('Operador de Teste')) problemas.push('exemplos de teste estão no bundle de produção')
if (problemas.length > 0) {
  console.error(problemas.join('\n'))
  process.exit(1)
}
console.log(`Bundle de produção conferido (${arquivos.length} arquivo): sem galeria e sem exemplos de teste.`)

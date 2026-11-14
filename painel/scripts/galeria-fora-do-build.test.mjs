// @vitest-environment node
// Prova que a galeria de componentes (e os dados de exemplo dela) não entram no build de produção:
// faz o build de verdade numa pasta temporária e procura a marca da galeria em todos os arquivos.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const MARCAS = [
  'galeria-de-componentes-somente-desenvolvimento',
  'Galeria de componentes',
  'TORNO-CNC-ROMI-GL-280-LINHA-DE-USINAGEM-PESADA',
]

async function arquivos(pasta) {
  const saida = []
  for (const entrada of await readdir(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name)
    if (entrada.isDirectory()) saida.push(...(await arquivos(caminho)))
    else saida.push(caminho)
  }
  return saida
}

describe('build de produção', () => {
  let destino

  afterAll(async () => {
    if (destino) await rm(destino, { recursive: true, force: true })
  })

  it('não contém a galeria nem os dados de exemplo', async () => {
    destino = await mkdtemp(path.join(tmpdir(), 'painel-build-'))
    await build({ root: RAIZ, logLevel: 'silent', build: { outDir: destino, emptyOutDir: true } })

    const lista = await arquivos(destino)
    expect(lista.some((f) => f.endsWith('index.html'))).toBe(true)
    expect(lista.some((f) => path.basename(f).startsWith('galeria'))).toBe(false)
    for (const arquivo of lista) {
      if (!/\.(html|js|css)$/.test(arquivo)) continue
      const texto = await readFile(arquivo, 'utf8')
      for (const marca of MARCAS) {
        expect(texto.includes(marca), `${path.basename(arquivo)} contém "${marca}"`).toBe(false)
      }
    }
  }, 180_000)
})

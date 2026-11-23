/**
 * Gera os tokens do app a partir dos tokens do painel (painel/src/index.css), para não copiar cor à
 * mão. Lê os primitivos (OKLCH), os semânticos de cada tema (claro e grafite) e os nomes das
 * utilidades ("@theme inline"), converte tudo para hexadecimal (o React Native não entende OKLCH) e
 * escreve:
 *   - src/tema/tokens.ts: cores por tema e escala de texto, para SVG e para o que precisa da cor em JS;
 *   - src/tema/tema.css: as mesmas cores como variáveis do Uniwind (light = claro, dark = grafite).
 *
 * Uso: node scripts/gerar-tema.mjs            (grava)
 *      node scripts/gerar-tema.mjs --conferir (falha se os arquivos versionados estão desatualizados)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { oklchParaHex } = require('./oklch.cjs')

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEM = resolve(raiz, '../painel/src/index.css')
const DESTINO_TS = resolve(raiz, 'src/tema/tokens.ts')
const DESTINO_CSS = resolve(raiz, 'src/tema/tema.css')

/** Nomes que o painel cria só para os componentes do shadcn; o app não usa. */
const APELIDOS_DO_SHADCN = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
])

/** Conteúdo entre as chaves do primeiro bloco cujo cabeçalho casa com o padrão. */
function bloco(css, cabecalho) {
  const inicio = css.search(cabecalho)
  if (inicio < 0) throw new Error(`bloco não encontrado: ${cabecalho}`)
  const abre = css.indexOf('{', inicio)
  let nivel = 0
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') nivel++
    else if (css[i] === '}' && --nivel === 0) return css.slice(abre + 1, i)
  }
  throw new Error(`bloco sem fim: ${cabecalho}`)
}

/** Declarações "--nome: valor;" de um bloco, sem comentários. */
function declaracoes(texto) {
  const semComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, '')
  const saida = new Map()
  for (const m of semComentarios.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) saida.set(m[1], m[2].trim())
  return saida
}

function camelo(nome) {
  return nome.replace(/-(\w)/g, (_, letra) => letra.toUpperCase())
}

const css = readFileSync(ORIGEM, 'utf8')
const primitivos = declaracoes(bloco(css, /@theme\s*\{/))
const claro = declaracoes(bloco(css, /:root\[data-theme='claro'\]/))
const grafite = declaracoes(bloco(css, /:root,\s*\[data-theme='grafite'\]/))
const utilidades = declaracoes(bloco(css, /@theme inline\s*\{/))

/** Valor final de um semântico: segue var(--primitivo) e converte OKLCH para hex. */
function resolver(valor, tema) {
  const ref = /^var\(--([\w-]+)\)$/.exec(valor)
  if (ref) {
    const nome = ref[1]
    const alvo = tema.get(nome) ?? primitivos.get(nome)
    if (!alvo) throw new Error(`variável não encontrada: ${nome}`)
    return resolver(alvo, tema)
  }
  if (valor.startsWith('oklch(')) return oklchParaHex(valor)
  throw new Error(`valor de cor não suportado: ${valor}`)
}

// cores: nome da utilidade (fundo, linha-forte...) -> semântico (superficie-fundo, linha-forte...)
const cores = new Map()
for (const [nome, valor] of utilidades) {
  if (!nome.startsWith('color-')) continue
  const utilidade = nome.slice('color-'.length)
  if (APELIDOS_DO_SHADCN.has(utilidade)) continue
  const ref = /^var\(--([\w-]+)\)$/.exec(valor)
  if (ref) cores.set(utilidade, ref[1])
}
// semânticos sem utilidade no painel (relevo dos botões, retícula) entram com o próprio nome
for (const nome of grafite.keys()) {
  if (nome === 'color-scheme') continue
  if (![...cores.values()].includes(nome)) cores.set(nome, nome)
}

function coresDoTema(tema) {
  const saida = {}
  for (const [utilidade, semantico] of cores) {
    const valor = tema.get(semantico)
    if (!valor) throw new Error(`o tema não define --${semantico}`)
    saida[utilidade] = resolver(valor, tema)
  }
  return saida
}

const temas = { claro: coresDoTema(claro), grafite: coresDoTema(grafite) }

// escala de texto: "--text-15: 0.9375rem" e "--text-15--line-height: 1.375rem" em px
const texto = {}
for (const [nome, valor] of primitivos) {
  const m = /^text-(\d+)$/.exec(nome)
  if (!m) continue
  const px = Number.parseFloat(valor) * (valor.endsWith('rem') ? 16 : 1)
  const altura = primitivos.get(`${nome}--line-height`) ?? '1'
  const alturaPx = altura.endsWith('rem')
    ? Number.parseFloat(altura) * 16
    : altura.endsWith('px')
      ? Number.parseFloat(altura)
      : Number.parseFloat(altura) * px
  texto[m[1]] = { tamanho: px, altura: alturaPx }
}

const AVISO = 'GERADO por scripts/gerar-tema.mjs a partir de painel/src/index.css. Não edite à mão.'

const ts = `/* ${AVISO} */

/** Cores semânticas por tema, em hexadecimal (convertidas do OKLCH do painel). */
export const CORES = {
${Object.entries(temas)
  .map(
    ([tema, valores]) =>
      `  ${tema}: {\n${Object.entries(valores)
        .map(([k, v]) => `    ${camelo(k)}: '${v}',`)
        .join('\n')}\n  },`,
  )
  .join('\n')}
} as const

export type NomeDoTema = keyof typeof CORES
export type Cores = { readonly [K in keyof (typeof CORES)['claro']]: string }

/** Escala de texto do painel (12 / 13 / 15 / 18 / 24 / 32, e 40 e 72 só onde a decisão acontece), em px. */
export const TEXTO = {
${Object.entries(texto)
  .map(([k, v]) => `  t${k}: { tamanho: ${v.tamanho}, altura: ${v.altura} },`)
  .join('\n')}
} as const
`

function variaveis(valores, recuo) {
  return Object.entries(valores)
    .map(([k, v]) => `${recuo}--color-${k}: ${v};`)
    .join('\n')
}

const tema = `/* ${AVISO} */

@theme {
  --color-*: initial;
  --text-*: initial;
  --radius-*: initial;

${Object.entries(texto)
  .map(([k, v]) => `  --text-${k}: ${v.tamanho}px;\n  --text-${k}--line-height: ${v.altura}px;`)
  .join('\n')}

  --radius-0: 0px;
  --radius-2: 2px;

  --color-transparent: transparent;
${variaveis(temas.claro, '  ')}
}

/* light = tema claro "cinza ISA" (padrão); dark = tema escuro "grafite" */
@layer theme {
  :root {
    @variant light {
${variaveis(temas.claro, '      ')}
    }
    @variant dark {
${variaveis(temas.grafite, '      ')}
    }
  }
}
`

if (process.argv.includes('--conferir')) {
  const atrasados = [
    [DESTINO_TS, ts],
    [DESTINO_CSS, tema],
  ].filter(([arquivo, conteudo]) => {
    try {
      return readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n') !== conteudo
    } catch {
      return true
    }
  })
  if (atrasados.length > 0) {
    console.error(
      `Tokens desatualizados em relação ao painel: ${atrasados.map(([a]) => a).join(', ')}. Rode "npm run tema".`,
    )
    process.exit(1)
  }
  console.log('Tokens do app conferem com os do painel.')
} else {
  writeFileSync(DESTINO_TS, ts)
  writeFileSync(DESTINO_CSS, tema)
  console.log(`Tokens gerados: ${cores.size} cores por tema, ${Object.keys(texto).length} tamanhos de texto.`)
}

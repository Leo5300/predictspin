import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** Commit do build (Diagnóstico › Sobre): o do Render, se houver, ou o do Git local. */
function commitDoBuild(): string {
  const doRender = process.env.RENDER_GIT_COMMIT
  if (doRender) return doRender.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'desconhecido'
  }
}

// No Windows, um terminal aberto em "c:\" (letra minúscula) faz o empacotador ver o mesmo arquivo com
// dois nomes ("c:/…" e "C:/…") e empacotar o React duas vezes; no build de produção o React chegava
// nulo ("Cannot read properties of null (reading 'useContext')"). A raiz sempre com letra maiúscula.
const raiz =
  process.platform === 'win32'
    ? import.meta.dirname.replace(/^[a-z]:/, (letra) => letra.toUpperCase())
    : import.meta.dirname
if (process.cwd() !== raiz && path.resolve(process.cwd()).toLowerCase() === raiz.toLowerCase()) {
  process.chdir(raiz)
}

const versao = (
  JSON.parse(readFileSync(path.resolve(raiz, 'package.json'), 'utf8')) as {
    version: string
  }
).version

/**
 * Content-Security-Policy do site publicado, numa <meta> escrita no index.html pelo build. O endereço
 * da API vem de VITE_API_URL, e o render.yaml não consegue montar um cabeçalho a partir de variável:
 * por isso a política nasce aqui, com connect-src só para a própria origem e a da API. O script em
 * linha do index.html (tema antes da primeira pintura) entra pelo hash, sem 'unsafe-inline'. Estilos
 * em linha são permitidos: componentes (avisos, gráficos, popover) definem posição e tamanho em
 * style. Fontes e imagens vêm do próprio site. frame-ancestors não vale em <meta>: o cabeçalho
 * X-Frame-Options: DENY (render.yaml) cobre.
 */
function politicaDeSeguranca(): Plugin {
  let api = 'http://localhost:8080'
  return {
    name: 'politica-de-seguranca',
    apply: 'build',
    configResolved(config) {
      const valor = config.env.VITE_API_URL as string | undefined
      if (valor) api = valor
    },
    transformIndexHtml(html) {
      const origemDaApi = new URL(api).origin
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        (m) =>
          `'sha256-${createHash('sha256')
            .update(m[1] ?? '')
            .digest('base64')}'`,
      )
      const politica = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`.trim(),
        "style-src 'self' 'unsafe-inline'",
        // fontes pequenas (latin-ext, vietnamita) vêm embutidas no CSS como data:
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        `connect-src 'self' ${origemDaApi}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${politica}" />`,
      )
    },
  }
}

// O build de produção só tem a entrada index.html. A galeria de componentes (galeria.html) é
// servida apenas pelo servidor de desenvolvimento e nunca entra em dist/.
export default defineConfig({
  root: raiz,
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/rotas',
      generatedRouteTree: './src/arvore-de-rotas.gen.ts',
    }),
    react(),
    tailwindcss(),
    politicaDeSeguranca(),
  ],
  define: {
    __VERSAO_DO_PAINEL__: JSON.stringify(versao),
    __COMMIT_DO_BUILD__: JSON.stringify(commitDoBuild()),
  },
  resolve: {
    alias: { '@': path.resolve(raiz, 'src') },
  },
  // Tudo pré-empacotado de uma vez na subida: descobrir dependências aos poucos faz o servidor de
  // desenvolvimento reempacotar no meio do carregamento e servir duas cópias do React.
  optimizeDeps: process.env.VITEST
    ? {}
    : {
        entries: ['index.html', 'galeria.html'],
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
          '@base-ui/react/button',
          '@base-ui/react/input',
          '@base-ui/react/toggle',
          '@base-ui/react/toggle-group',
          '@base-ui/react/tooltip',
          '@hookform/resolvers/zod',
          '@tanstack/react-query',
          '@tanstack/react-router',
          'class-variance-authority',
          'clsx',
          'lucide-react',
          'openapi-fetch',
          'react-hook-form',
          'sonner',
          'tailwind-merge',
          'uplot',
          'zod',
        ],
      },
  // Os testes usam um cache próprio: o pré-empacotamento do servidor de desenvolvimento, quando ligado
  // ao mesmo tempo, faria o Vitest carregar uma segunda cópia de si mesmo
  cacheDir: process.env.VITEST ? 'node_modules/.vite-testes' : 'node_modules/.vite',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    sourcemap: false,
    target: 'es2023',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testes/preparo.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    css: false,
    restoreMocks: true,
  },
})

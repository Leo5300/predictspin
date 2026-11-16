import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
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

const versao = (
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
    version: string
  }
).version

// O build de produção só tem a entrada index.html. A galeria de componentes (galeria.html) é
// servida apenas pelo servidor de desenvolvimento e nunca entra em dist/.
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/rotas',
      generatedRouteTree: './src/arvore-de-rotas.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  define: {
    __VERSAO_DO_PAINEL__: JSON.stringify(versao),
    __COMMIT_DO_BUILD__: JSON.stringify(commitDoBuild()),
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
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
  build: { sourcemap: false, target: 'es2023' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testes/preparo.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    css: false,
    restoreMocks: true,
  },
})

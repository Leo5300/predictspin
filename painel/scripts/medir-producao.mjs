/* global document, window -- trechos executados dentro da página pelo Playwright */
/**
 * Mede o build de produção servido localmente ("npx vite preview --port 5173"): violações da
 * Content-Security-Policy em cada tela e as métricas de navegação do carregamento inicial (sem
 * cache), pelo Playwright. Entra com o administrador do .env sem imprimir nada dele.
 *
 *   node scripts/medir-producao.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from '@playwright/test'

const PAINEL = 'http://localhost:5173'
const env = Object.fromEntries(
  readFileSync(path.resolve(import.meta.dirname, '..', '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const navegador = await chromium.launch()
const violacoes = []
try {
  // carregamento inicial a frio (5 vezes, contexto novo a cada vez)
  const medidas = []
  for (let i = 0; i < 5; i++) {
    const contexto = await navegador.newContext({ viewport: { width: 1920, height: 1080 } })
    const pagina = await contexto.newPage()
    await pagina.goto(`${PAINEL}/login`, { waitUntil: 'load' })
    await pagina.getByLabel('E-mail').waitFor()
    const m = await pagina.evaluate(async () => {
      const [nav] = performance.getEntriesByType('navigation')
      // a pintura pode ser registrada depois do load: espera até 3 s pelo FCP
      const fcp = await new Promise((resolver) => {
        const observador = new PerformanceObserver((lista) => {
          const e = lista.getEntriesByName('first-contentful-paint')[0]
          if (e) resolver(e)
        })
        observador.observe({ type: 'paint', buffered: true })
        setTimeout(() => resolver(null), 3000)
      })
      return {
        ttfb: nav.responseStart,
        domContentLoaded: nav.domContentLoadedEventEnd,
        load: nav.loadEventEnd,
        fcp: fcp ? fcp.startTime : null,
        transferido: performance
          .getEntriesByType('resource')
          .reduce((s, r) => s + (r.transferSize || 0), nav.transferSize || 0),
      }
    })
    medidas.push(m)
    await contexto.close()
  }
  const mediana = (k) => {
    const v = medidas.map((m) => m[k]).filter((x) => x !== null).sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : null
  }
  const ms = (k) => (mediana(k) === null ? 'n/d' : `${mediana(k).toFixed(0)} ms`)
  console.log(
    `carga inicial do /login (mediana de 5, sem cache): TTFB ${ms('ttfb')}, ` +
      `FCP ${ms('fcp')}, DOMContentLoaded ${ms('domContentLoaded')}, ` +
      `load ${ms('load')}, transferido ${(mediana('transferido') / 1024).toFixed(0)} kB`,
  )

  // CSP: percorre as telas e coleta violações
  const contexto = await navegador.newContext({ viewport: { width: 1920, height: 1080 } })
  const pagina = await contexto.newPage()
  await pagina.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window.__violacoes ??= []).push(`${e.violatedDirective} ${e.blockedURI} em ${e.sourceFile?.split('/').pop()}:${e.lineNumber}:${e.columnNumber}`)
    })
    localStorage.setItem('ps.fonte', 'simulado')
  })
  const rotasCarregadas = new Set()
  pagina.on('response', (r) => {
    if (r.url().includes('/assets/') && r.url().endsWith('.js')) rotasCarregadas.add(path.basename(r.url()))
  })
  await pagina.goto(`${PAINEL}/login`)
  await pagina.getByLabel('E-mail').fill(env.ADMIN_EMAIL)
  await pagina.getByLabel('Senha').fill(env.ADMIN_SENHA)
  await pagina.getByRole('button', { name: 'Entrar' }).click()
  await pagina.waitForURL((u) => !u.pathname.startsWith('/login'))
  const depoisDoLogin = rotasCarregadas.size
  for (const rota of ['/', '/maquinas/1', '/maquinas/1/pontos/B', '/coleta', '/coleta/ensaios', '/diagnostico', '/alarmes']) {
    await pagina.goto(`${PAINEL}${rota}`)
    await pagina.waitForTimeout(2500)
    const v = await pagina.evaluate(() => window.__violacoes ?? [])
    for (const x of v) violacoes.push(`${rota}: ${x}`)
  }
  console.log(`arquivos JS carregados até a visão geral: ${depoisDoLogin}; depois de abrir todas as telas: ${rotasCarregadas.size} (as rotas carregam sob demanda)`)
  await contexto.close()
} finally {
  await navegador.close()
}
console.log(violacoes.length === 0 ? 'CSP: nenhuma violação' : `CSP: ${violacoes.length} violação(ões)\n${violacoes.join('\n')}`)

import { defineConfig, devices } from '@playwright/test'

/**
 * Testes de ponta a ponta contra o ambiente LOCAL: a API e o banco do docker compose
 * (http://localhost:8080) e o servidor do Vite (http://localhost:5173). Nunca contra a API publicada.
 * Os testes que precisam de janelas chegando ligam o próprio simulador (e2e/apoio/simulador.ts).
 */
export default defineConfig({
  testDir: './e2e',
  // os cenários dividem o mesmo simulador e o mesmo banco: um de cada vez
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: 'npx vite',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})

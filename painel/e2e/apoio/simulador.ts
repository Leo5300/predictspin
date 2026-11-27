import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { EOL } from 'node:os'
import path from 'node:path'

import { RAIZ_DO_REPOSITORIO, URL_API } from './ambiente'

/**
 * Simulador de janelas (analise/simulador.py) ligado pelos próprios testes, sempre contra a API
 * local. As variáveis do computador que poderiam apontar para outro servidor são removidas do
 * ambiente do processo; sem elas, o simulador completa a chave do dispositivo com o .env da raiz
 * (nada passa pela linha de comando nem é impresso).
 */
export type Simulador = { parar: () => void }

const REMOVIDAS = [
  'PS_URL',
  'PREDICTSPIN_URL',
  'DISPOSITIVO_SIM_CHAVE',
  'ADMIN_EMAIL',
  'ADMIN_SENHA',
]

function ambienteLimpo(): NodeJS.ProcessEnv {
  const ambiente: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([nome]) => !REMOVIDAS.includes(nome)),
  )
  ambiente.PYTHONUNBUFFERED = '1'
  ambiente.PYTHONIOENCODING = 'utf-8'
  return ambiente
}

/** Simulador contínuo; {@code argumentos} vão depois de "continuo" (ex.: --modo severo --rotacao 1120). */
export function ligarSimulador(argumentos: readonly string[] = []): Simulador {
  const processo: ChildProcess = spawn(
    'python',
    [path.join('analise', 'simulador.py'), 'continuo', '--url', URL_API, ...argumentos],
    { cwd: RAIZ_DO_REPOSITORIO, env: ambienteLimpo(), stdio: 'ignore', windowsHide: true },
  )
  return {
    parar() {
      if (processo.exitCode !== null || processo.pid === undefined) return
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(processo.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        processo.kill('SIGTERM')
      }
    },
  }
}

/** Roteiro de ensaios simulados (subcomando roteiro), esperando terminar; falha se o simulador falhar. */
export function executarRoteiro(argumentos: readonly string[]): void {
  const resultado = spawnSync(
    'python',
    [path.join('analise', 'simulador.py'), 'roteiro', '--url', URL_API, ...argumentos],
    {
      cwd: RAIZ_DO_REPOSITORIO,
      env: ambienteLimpo(),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      windowsHide: true,
    },
  )
  if (resultado.status !== 0) {
    // só o fim da saída, para o erro dizer o que aconteceu (o simulador não imprime a chave)
    const fim = `${resultado.stdout}${EOL}${resultado.stderr}`.trim().split(EOL).slice(-4).join(' | ')
    throw new Error(`roteiro do simulador saiu com ${String(resultado.status)}: ${fim.slice(0, 400)}`)
  }
}

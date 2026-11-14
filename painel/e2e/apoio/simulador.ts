import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
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

export function ligarSimulador(): Simulador {
  const ambiente: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([nome]) => !REMOVIDAS.includes(nome)),
  )
  ambiente.PYTHONUNBUFFERED = '1'
  ambiente.PYTHONIOENCODING = 'utf-8'
  const processo: ChildProcess = spawn(
    'python',
    [path.join('analise', 'simulador.py'), 'continuo', '--url', URL_API],
    { cwd: RAIZ_DO_REPOSITORIO, env: ambiente, stdio: 'ignore', windowsHide: true },
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

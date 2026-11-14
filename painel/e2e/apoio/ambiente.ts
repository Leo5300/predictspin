import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Ambiente dos testes de ponta a ponta: sempre a API LOCAL do docker compose e as credenciais do
 * .env da raiz do repositório. Variáveis de ambiente do computador são ignoradas de propósito (elas
 * podem apontar para produção), e nenhum valor lido aqui é impresso.
 */
export const URL_API = 'http://localhost:8080'
export const URL_PAINEL = 'http://localhost:5173'

const RAIZ = path.resolve(import.meta.dirname, '..', '..', '..')

function lerEnv(): Record<string, string> {
  const valores: Record<string, string> = {}
  const texto = readFileSync(path.join(RAIZ, '.env'), 'utf8')
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim()
    if (!limpa || limpa.startsWith('#') || !limpa.includes('=')) continue
    const separador = limpa.indexOf('=')
    valores[limpa.slice(0, separador).trim()] = limpa.slice(separador + 1).trim()
  }
  return valores
}

const env = lerEnv()

function exigir(nome: string): string {
  const valor = env[nome]
  if (!valor) throw new Error(`Defina ${nome} no .env da raiz do repositório.`)
  return valor
}

export const ADMIN = { email: exigir('ADMIN_EMAIL'), senha: exigir('ADMIN_SENHA') }
export const RAIZ_DO_REPOSITORIO = RAIZ

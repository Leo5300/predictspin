/**
 * Sessão de coleta: sequência de gravações na mesma rotação e com a mesma receita (T0 opcional,
 * depois T1 → T2 → T3), montada uma vez. Existe só no painel (na API cada gravação é um ensaio). Lógica
 * pura: avançar ao encerrar uma etapa, pular uma etapa, encerrar a sessão e ler/gravar no navegador.
 */
import { rotacaoDaEtapa, type Condicao, type Etapa } from './coleta'
import type { Receita } from './receita'

export type GravacaoDaSessao = { etapa: Etapa; ensaioId: number; codigo: string }

export type Sessao = {
  maquinaId: number
  /** Rotação da sessão (T0, se houver, grava a 0 rpm). */
  rotacao: number
  /** Etapas na ordem em que serão gravadas. */
  etapas: Etapa[]
  /** Índice da etapa atual em `etapas`; igual ao tamanho = sessão concluída. */
  indice: number
  /** Condição do corte (T3); as outras etapas são sempre normal. */
  condicaoT3: Condicao
  receita: Receita
  simulado: boolean
  gravadas: GravacaoDaSessao[]
  puladas: Etapa[]
  criadaEm: string
}

export function criarSessao(dados: {
  maquinaId: number
  rotacao: number
  comT0: boolean
  condicaoT3: Condicao
  receita: Receita
  simulado: boolean
  agora: Date
  /** Etapa por onde começar (padrão: T0 ou T1). */
  desde?: Etapa
}): Sessao {
  const todas: Etapa[] = dados.comT0 ? ['T0', 'T1', 'T2', 'T3'] : ['T1', 'T2', 'T3']
  const inicio = dados.desde ? Math.max(0, todas.indexOf(dados.desde)) : 0
  return {
    maquinaId: dados.maquinaId,
    rotacao: dados.rotacao,
    etapas: todas.slice(inicio),
    indice: 0,
    condicaoT3: dados.condicaoT3,
    receita: dados.receita,
    simulado: dados.simulado,
    gravadas: [],
    puladas: [],
    criadaEm: dados.agora.toISOString(),
  }
}

/** A etapa que está para ser gravada; nula com a sessão concluída. */
export function etapaAtual(sessao: Sessao): Etapa | null {
  return sessao.etapas[sessao.indice] ?? null
}

export function concluida(sessao: Sessao): boolean {
  return sessao.indice >= sessao.etapas.length
}

/** O que gravar agora: etapa, condição e rotação alvo. */
export function proximaDaSessao(
  sessao: Sessao,
): { etapa: Etapa; condicao: Condicao; rotacao: number } | null {
  const etapa = etapaAtual(sessao)
  if (!etapa) return null
  return {
    etapa,
    condicao: etapa === 'T3' ? sessao.condicaoT3 : 'normal',
    rotacao: rotacaoDaEtapa(etapa, sessao.rotacao),
  }
}

/** Uma etapa foi gravada e encerrada: registra e passa para a seguinte. */
export function avancar(sessao: Sessao, gravada: GravacaoDaSessao): Sessao {
  if (concluida(sessao)) return sessao
  return { ...sessao, gravadas: [...sessao.gravadas, gravada], indice: sessao.indice + 1 }
}

/** Pula a etapa atual sem gravar. */
export function pular(sessao: Sessao): Sessao {
  const etapa = etapaAtual(sessao)
  if (!etapa) return sessao
  return { ...sessao, puladas: [...sessao.puladas, etapa], indice: sessao.indice + 1 }
}

/** Texto curto: "próxima é T2 a 450 rpm". */
export function textoDaProxima(sessao: Sessao): string {
  const proxima = proximaDaSessao(sessao)
  if (!proxima) return 'sessão concluída'
  return `${proxima.etapa} a ${proxima.rotacao} rpm`
}

// ---------------------------------------------------------------- armazenamento no navegador

const CHAVE = 'ps.sessao-coleta'

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Confere a forma do que foi lido (o navegador pode guardar algo antigo ou mexido à mão). */
function ehSessao(valor: unknown): valor is Sessao {
  if (typeof valor !== 'object' || valor === null) return false
  const s = valor as Record<string, unknown>
  return (
    typeof s.maquinaId === 'number' &&
    typeof s.rotacao === 'number' &&
    Array.isArray(s.etapas) &&
    typeof s.indice === 'number' &&
    typeof s.condicaoT3 === 'string' &&
    typeof s.receita === 'object' &&
    s.receita !== null &&
    typeof s.simulado === 'boolean' &&
    Array.isArray(s.gravadas) &&
    Array.isArray(s.puladas)
  )
}

export function lerSessao(armazenamento: Armazenamento | null): Sessao | null {
  if (!armazenamento) return null
  try {
    const texto = armazenamento.getItem(CHAVE)
    if (!texto) return null
    const valor: unknown = JSON.parse(texto)
    return ehSessao(valor) ? valor : null
  } catch {
    return null
  }
}

export function gravarSessao(armazenamento: Armazenamento | null, sessao: Sessao | null) {
  if (!armazenamento) return
  try {
    if (sessao === null || concluida(sessao)) armazenamento.removeItem(CHAVE)
    else armazenamento.setItem(CHAVE, JSON.stringify(sessao))
  } catch {
    /* sem armazenamento a sessão vale só até recarregar */
  }
}

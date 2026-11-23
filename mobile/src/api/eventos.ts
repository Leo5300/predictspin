/**
 * Eventos ao vivo de uma máquina (SSE), a mesma rota do painel. O fluxo é lido pelo fetch do Expo
 * (expo/fetch, que no celular é o fetch global e lê a resposta em pedaços), com o token no cabeçalho
 * Authorization, nunca na URL. Se a conexão cai, reconecta com a mesma espera do painel (1, 2, 4, 8,
 * 15 e 30 s); quem usa decide o que fazer enquanto isso (consulta a cada 5 s).
 */
import { criarLeitorSse, esperaDeReconexaoS } from '@/dominio/eventosSse'

import { URL_API } from './configuracao'
import { lerRetryAfter } from './erros'
import { AVISO_SESSAO_EXPIRADA, encerrarSessao, tokenAtual } from './sessao'
import type { AlertaSse, Janela, ModoRapido, OrdemServicoSse } from './tipos'

export type EstadoEventos = 'conectando' | 'ao_vivo' | 'reconectando'

export type OpcoesDeEventos = {
  maquinaId: number
  simulado: boolean
  aoReceberJanela: (janela: Janela) => void
  aoReceberModoRapido?: (estado: ModoRapido) => void
  /** Alerta aberto, piorado, normalizado, reconhecido, suprimido ou encerrado. */
  aoReceberAlerta?: (evento: AlertaSse) => void
  /** Ordem de serviço aberta, assumida ou concluída. */
  aoReceberOrdemServico?: (evento: OrdemServicoSse) => void
  /** Janelas antigas reenviadas pelo dispositivo depois de uma queda. */
  aoReceberRecuperacao?: () => void
  aoMudarEstado: (estado: EstadoEventos) => void
}

/** Sem nada do servidor por este tempo (nem batimento, que vem a cada 15 s), a conexão é refeita. */
const SILENCIO_MAXIMO_MS = 40_000

/** Abre o fluxo e o mantém aberto até cancelar. Devolve a função que cancela. */
export function assinarEventos(opcoes: OpcoesDeEventos): () => void {
  const controle = new AbortController()
  void manter(opcoes, controle.signal)
  return () => controle.abort()
}

/** Lido por função para o TypeScript não tratar o sinal como constante entre as esperas. */
function cancelado(sinal: AbortSignal): boolean {
  return sinal.aborted
}

async function manter(opcoes: OpcoesDeEventos, sinal: AbortSignal) {
  let tentativa = 0
  while (!cancelado(sinal)) {
    opcoes.aoMudarEstado(tentativa === 0 ? 'conectando' : 'reconectando')
    let esperaS: number
    try {
      const resultado = await conectar(opcoes, sinal, () => {
        tentativa = 0
      })
      if (resultado === 'sem_sessao') return
      tentativa += 1
      esperaS = resultado ?? esperaDeReconexaoS(tentativa)
    } catch {
      if (cancelado(sinal)) return
      tentativa += 1
      esperaS = esperaDeReconexaoS(tentativa)
    }
    if (cancelado(sinal)) return
    opcoes.aoMudarEstado('reconectando')
    await dormir(esperaS * 1000, sinal)
  }
}

/** Lê o fluxo até ele acabar. Devolve a espera pedida pelo servidor (Retry-After), se houver. */
async function conectar(
  opcoes: OpcoesDeEventos,
  sinal: AbortSignal,
  aoConectar: () => void,
): Promise<number | null | 'sem_sessao'> {
  const token = tokenAtual()
  if (!token) return 'sem_sessao'

  const conexao = new AbortController()
  const abortar = () => conexao.abort()
  sinal.addEventListener('abort', abortar)
  let vigia: ReturnType<typeof setTimeout> | undefined
  const reiniciarVigia = () => {
    clearTimeout(vigia)
    vigia = setTimeout(abortar, SILENCIO_MAXIMO_MS)
  }

  try {
    const url = `${URL_API}/api/v1/maquinas/${opcoes.maquinaId}/eventos?simulado=${opcoes.simulado}`
    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream, application/json' },
      signal: conexao.signal,
    })
    if (resposta.status === 401) {
      await encerrarSessao(AVISO_SESSAO_EXPIRADA)
      return 'sem_sessao'
    }
    if (!resposta.ok || !resposta.body) {
      return lerRetryAfter(resposta)
    }

    aoConectar()
    opcoes.aoMudarEstado('ao_vivo')
    const leitor = criarLeitorSse()
    const fluxo = resposta.body.getReader()
    const decodificador = new TextDecoder()
    reiniciarVigia()
    for (;;) {
      const { done, value } = await fluxo.read()
      if (done) break
      reiniciarVigia()
      for (const evento of leitor.alimentar(decodificador.decode(value, { stream: true }))) {
        if (evento.tipo === 'evento') entregar(evento.nome, evento.dados, opcoes)
      }
    }
    return null
  } finally {
    clearTimeout(vigia)
    sinal.removeEventListener('abort', abortar)
    conexao.abort()
  }
}

function entregar(nome: string, dados: string, opcoes: OpcoesDeEventos) {
  let corpo: unknown
  try {
    corpo = JSON.parse(dados)
  } catch {
    return
  }
  // O corpo de cada evento é o esquema de mesmo nome do contrato; a API garante a forma, conferida
  // pelo teste de contrato da API.
  if (nome === 'janela') opcoes.aoReceberJanela(corpo as Janela)
  else if (nome === 'modo_rapido') opcoes.aoReceberModoRapido?.(corpo as ModoRapido)
  else if (nome === 'alerta') opcoes.aoReceberAlerta?.(corpo as AlertaSse)
  else if (nome === 'os') opcoes.aoReceberOrdemServico?.(corpo as OrdemServicoSse)
  else if (nome === 'recuperacao') opcoes.aoReceberRecuperacao?.()
}

function dormir(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(terminar, ms)
    function terminar() {
      clearTimeout(temporizador)
      sinal.removeEventListener('abort', terminar)
      resolver()
    }
    sinal.addEventListener('abort', terminar)
  })
}

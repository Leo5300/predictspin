/**
 * Eventos ao vivo de uma máquina (SSE). O fluxo é lido por fetch, com o token no cabeçalho
 * Authorization (EventSource não permite cabeçalhos e obrigaria a pôr o token na URL). Se a conexão
 * cai, reconecta com espera crescente; quem usa decide o que fazer enquanto isso (consulta
 * periódica).
 */
import { criarLeitorSse, esperaDeReconexaoS } from '@/dominio/eventosSse'

import { AVISO_SESSAO_EXPIRADA, URL_API } from './cliente'
import { lerRetryAfter } from './erros'
import { encerrarSessao, tokenAtual } from './sessao'
import type { components } from './esquema'
import type { EnsaioEvento, Janela, ModoRapido } from './tipos'

export type EventoMarcadoSse = components['schemas']['EventoMarcadoResposta']
export type AlertaSse = components['schemas']['AlertaEvento']
export type OrdemServicoSse = components['schemas']['OrdemServicoEvento']
export type RecuperacaoSse = components['schemas']['RecuperacaoEvento']

export type EstadoEventos = 'conectando' | 'ao_vivo' | 'reconectando'

export type OpcoesDeEventos = {
  maquinaId: number
  simulado: boolean
  aoReceberJanela: (janela: Janela) => void
  aoReceberEnsaio: (evento: EnsaioEvento) => void
  aoReceberModoRapido: (estado: ModoRapido) => void
  /** Evento marcado num ensaio aberto (só para ADMIN e TECNICO). */
  aoReceberEventoMarcado?: (evento: EventoMarcadoSse) => void
  /** Alerta aberto, piorado, normalizado, reconhecido, suprimido ou encerrado. */
  aoReceberAlerta?: (evento: AlertaSse) => void
  /** Ordem de serviço aberta, assumida ou concluída. */
  aoReceberOrdemServico?: (evento: OrdemServicoSse) => void
  /** Janelas antigas reenviadas pelo dispositivo depois de uma queda (de, ate, quantidade). */
  aoReceberRecuperacao?: (evento: RecuperacaoSse) => void
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

/** O sinal é cancelado de fora, durante as esperas: lido por função para não ser dado como constante. */
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
      cache: 'no-store',
    })
    if (resposta.status === 401) {
      encerrarSessao(AVISO_SESSAO_EXPIRADA)
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
  // O corpo de cada evento é o esquema de mesmo nome do contrato (JanelaResposta, EnsaioEvento,
  // ModoRapidoResposta); a API garante a forma, conferida pelo teste de contrato.
  if (nome === 'janela') opcoes.aoReceberJanela(corpo as Janela)
  else if (nome === 'ensaio') opcoes.aoReceberEnsaio(corpo as EnsaioEvento)
  else if (nome === 'modo_rapido') opcoes.aoReceberModoRapido(corpo as ModoRapido)
  else if (nome === 'evento_marcado') opcoes.aoReceberEventoMarcado?.(corpo as EventoMarcadoSse)
  else if (nome === 'alerta') opcoes.aoReceberAlerta?.(corpo as AlertaSse)
  else if (nome === 'os') opcoes.aoReceberOrdemServico?.(corpo as OrdemServicoSse)
  else if (nome === 'recuperacao') opcoes.aoReceberRecuperacao?.(corpo as RecuperacaoSse)
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

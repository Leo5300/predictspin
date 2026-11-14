/**
 * Leitor incremental de Server-Sent Events. Recebe o texto como ele chega da rede (em pedaços que
 * podem cortar uma linha no meio) e devolve os eventos completos. Linhas de comentário (as de
 * batimento, que começam com ":") viram um aviso de que a conexão está viva.
 */

export type EventoSse = { tipo: 'evento'; nome: string; dados: string } | { tipo: 'batimento' }

export type LeitorSse = { alimentar: (pedaco: string) => EventoSse[] }

export function criarLeitorSse(): LeitorSse {
  let resto = ''
  let nome = ''
  let dados: string[] = []

  function fecharEvento(saida: EventoSse[]) {
    if (dados.length > 0) {
      saida.push({ tipo: 'evento', nome: nome || 'message', dados: dados.join('\n') })
    }
    nome = ''
    dados = []
  }

  function lerLinha(linha: string, saida: EventoSse[]) {
    if (linha === '') {
      fecharEvento(saida)
      return
    }
    if (linha.startsWith(':')) {
      saida.push({ tipo: 'batimento' })
      return
    }
    const separador = linha.indexOf(':')
    const campo = separador === -1 ? linha : linha.slice(0, separador)
    let valor = separador === -1 ? '' : linha.slice(separador + 1)
    if (valor.startsWith(' ')) valor = valor.slice(1)
    if (campo === 'event') nome = valor
    else if (campo === 'data') dados.push(valor)
    // "id" e "retry" não são usados pela API
  }

  return {
    alimentar(pedaco) {
      const saida: EventoSse[] = []
      const texto = resto + pedaco
      const linhas = texto.split(/\r\n|\n|\r/)
      // a última parte pode ser uma linha incompleta: fica para o próximo pedaço
      resto = linhas.pop() ?? ''
      // um "\r" no fim do pedaço pode ser a metade de um "\r\n"
      if (texto.endsWith('\r')) {
        resto = `${linhas.pop() ?? ''}\r`
      }
      for (const linha of linhas) lerLinha(linha, saida)
      return saida
    },
  }
}

/** Espera antes da n-ésima tentativa de reconexão (n começa em 1): 1, 2, 4, 8, 15 e então 30 s. */
const ESPERAS_S = [1, 2, 4, 8, 15, 30]

export function esperaDeReconexaoS(tentativa: number): number {
  const indice = Math.min(Math.max(1, Math.floor(tentativa)), ESPERAS_S.length) - 1
  return ESPERAS_S[indice] ?? 30
}

/**
 * Checagem antes de gravar (pré-voo), a partir das janelas que estão chegando. Cada item diz se está
 * ok, se só avisa (e o que fazer) ou se bloqueia a gravação. Bloqueiam: não haver dado vivo e já haver
 * ensaio aberto na máquina. O resto só avisa.
 */
import type { Etapa } from './coleta'
import type { Frescor } from './idade'

export const TOLERANCIA_ROTACAO = 0.1
export const FRACAO_MINIMA_AMOSTRAS = 0.98
/** Abaixo disto a máquina conta como parada (T0). */
export const ROTACAO_PARADA_RPM = 20

export type EstadoDoItem = 'ok' | 'aviso' | 'bloqueia'

export type ItemDoPreVoo = {
  chave: 'pontos' | 'rotacao' | 'saturacao' | 'amostras' | 'ensaio' | 'origem'
  rotulo: string
  estado: EstadoDoItem
  /** O que foi visto, curto. */
  detalhe: string
  /** O que fazer, quando não está ok. */
  oQueFazer?: string
}

export type JanelaDoPreVoo = {
  rotacao_rpm: number
  saturou: boolean
  amostras?: number | null
  amostras_esperadas?: number | null
  simulado: boolean
  pontos: Record<string, unknown>
}

export type EntradaDoPreVoo = {
  janela: JanelaDoPreVoo | null | undefined
  frescor: Frescor
  etapa: Etapa
  rotacaoAlvo: number
  /** Código do ensaio aberto na máquina, se houver. */
  ensaioAberto: string | null
  /** Fonte escolhida no painel. */
  simulado: boolean
  /** Pontos esperados (A, B, C). */
  pontosEsperados: readonly string[]
}

/** Rotação sem separador de milhar (como no tacômetro): "1120". */
const fmt = (n: number) => String(Math.round(n))

export function preVoo(e: EntradaDoPreVoo): ItemDoPreVoo[] {
  const vivo = e.frescor === 'vivo' && e.janela
  const janela = vivo ? e.janela : null
  const itens: ItemDoPreVoo[] = []

  // 1. pontos presentes e vivos
  if (!janela) {
    itens.push({
      chave: 'pontos',
      rotulo: `${e.pontosEsperados.join(', ')} presentes e vivos`,
      estado: 'bloqueia',
      detalhe: e.frescor === 'ausente' ? 'nenhuma janela recebida' : 'sem dado vivo',
      oQueFazer: 'Confira se o dispositivo está ligado e conectado ao Wi-Fi.',
    })
  } else {
    const faltando = e.pontosEsperados.filter((p) => !(p in janela.pontos))
    itens.push({
      chave: 'pontos',
      rotulo: `${e.pontosEsperados.join(', ')} presentes e vivos`,
      estado: faltando.length === 0 ? 'ok' : 'aviso',
      detalhe:
        faltando.length === 0 ? 'todos chegando' : `sem ${faltando.join(', ')} na última janela`,
      oQueFazer:
        faltando.length === 0 ? undefined : 'Confira o cabo e a fixação do sensor que falta.',
    })
  }

  // 2. rotação coerente com o alvo
  if (janela) {
    const rpm = janela.rotacao_rpm
    if (e.etapa === 'T0') {
      const parado = rpm < ROTACAO_PARADA_RPM
      itens.push({
        chave: 'rotacao',
        rotulo: 'Rotação 0 (torno desligado)',
        estado: parado ? 'ok' : 'aviso',
        detalhe: `${fmt(rpm)} rpm`,
        oQueFazer: parado ? undefined : 'No T0 o torno fica desligado.',
      })
    } else {
      const desvio = e.rotacaoAlvo > 0 ? Math.abs(rpm - e.rotacaoAlvo) / e.rotacaoAlvo : 1
      const ok = desvio <= TOLERANCIA_ROTACAO
      itens.push({
        chave: 'rotacao',
        rotulo: `Rotação perto de ${fmt(e.rotacaoAlvo)} rpm (±10%)`,
        estado: ok ? 'ok' : 'aviso',
        detalhe: `${fmt(rpm)} rpm`,
        oQueFazer: ok
          ? undefined
          : rpm < ROTACAO_PARADA_RPM
            ? 'Ligue o torno na rotação alvo e espere estabilizar.'
            : 'Confira a marcha do torno e espere a rotação estabilizar.',
      })
    }

    // 3. saturação
    itens.push({
      chave: 'saturacao',
      rotulo: 'Sem saturação',
      estado: janela.saturou ? 'aviso' : 'ok',
      detalhe: janela.saturou ? 'a última janela saturou' : 'nenhum sensor no limite',
      oQueFazer: janela.saturou
        ? 'Procure pancada ou sensor batendo; a janela saturada fica fora do aprendizado.'
        : undefined,
    })

    // 4. amostras
    const { amostras, amostras_esperadas: esperadas } = janela
    if (amostras === null || amostras === undefined || !esperadas) {
      itens.push({
        chave: 'amostras',
        rotulo: 'Amostras ≥ 98% das esperadas',
        estado: 'aviso',
        detalhe: 'o dispositivo não informou a contagem',
        oQueFazer: 'Atualize o firmware para enviar amostras e esperadas.',
      })
    } else {
      const fracao = amostras / esperadas
      const ok = fracao >= FRACAO_MINIMA_AMOSTRAS
      itens.push({
        chave: 'amostras',
        rotulo: 'Amostras ≥ 98% das esperadas',
        estado: ok ? 'ok' : 'aviso',
        detalhe: `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
        oQueFazer: ok ? undefined : 'Janelas incompletas saem do aprendizado; confira o Wi-Fi.',
      })
    }
  }

  // 5. ensaio aberto
  itens.push({
    chave: 'ensaio',
    rotulo: 'Nenhum ensaio aberto na máquina',
    estado: e.ensaioAberto ? 'bloqueia' : 'ok',
    detalhe: e.ensaioAberto ? `aberto: ${e.ensaioAberto}` : 'livre',
    oQueFazer: e.ensaioAberto ? 'Encerre ou descarte o ensaio aberto antes.' : undefined,
  })

  // 6. origem do dado
  if (janela) {
    const coincide = janela.simulado === e.simulado
    itens.push({
      chave: 'origem',
      rotulo: 'Origem do dado',
      estado: coincide ? 'ok' : 'aviso',
      detalhe: janela.simulado ? 'simulado (não é medição)' : 'medição real',
      oQueFazer: coincide
        ? undefined
        : 'A fonte escolhida no painel não é a do dado que está chegando.',
    })
  }
  return itens
}

export function bloqueado(itens: readonly ItemDoPreVoo[]): boolean {
  return itens.some((i) => i.estado === 'bloqueia')
}

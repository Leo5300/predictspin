/**
 * Estado da máquina e de cada ponto, como a tela mostra: texto + forma + tom (ISA-101: cinza é o
 * normal, cor só para desvio, e todo estado em pelo menos dois canais). Nada é recalculado aqui: a
 * situação, o estado (com atraso e histerese) e o z vêm da API; o app só escolhe como mostrar.
 */
import type { Frescor } from './idade'

export type Forma = 'circulo' | 'triangulo' | 'losango' | 'quadrado' | 'anel'

/**
 * Tom do estado. "neutro" e "apagado" são cinzas; "atencao" e "alarme" são as únicas cores de
 * desvio; "info" (ardósia) é do alerta de instrumento, que não é falha da máquina.
 */
export type Tom = 'neutro' | 'apagado' | 'atencao' | 'alarme' | 'info'

// ------------------------------------------------------------------ máquina

/** OPERANDO = dado vivo e rotação acima de zero; PARADO = vivo e zero; SEM DADOS = velho ou nenhum. */
export type EstadoMaquina = 'operando' | 'parado' | 'sem_dados'

export const ROTULO_ESTADO_MAQUINA: Record<EstadoMaquina, string> = {
  operando: 'OPERANDO',
  parado: 'PARADO',
  sem_dados: 'SEM DADOS',
}

export const FORMA_ESTADO_MAQUINA: Record<EstadoMaquina, Forma> = {
  operando: 'triangulo',
  parado: 'quadrado',
  sem_dados: 'anel',
}

export function estadoDaMaquina(
  frescor: Frescor,
  rotacaoRpm: number | null | undefined,
): EstadoMaquina {
  if (frescor !== 'vivo' || rotacaoRpm === null || rotacaoRpm === undefined) return 'sem_dados'
  return rotacaoRpm > 0 ? 'operando' : 'parado'
}

// ------------------------------------------------------------------ ponto

/** Situação da avaliação de um ponto numa janela (códigos da API). */
export type Situacao =
  | 'avaliada'
  | 'sem_referencia'
  | 'sem_referencia_completa'
  | 'calibracao_diferente'
  | 'nao_avaliavel'

export function situacaoDoPonto(avaliacao: { situacao: string } | null | undefined): Situacao {
  const s = avaliacao?.situacao
  return s === 'avaliada' ||
    s === 'sem_referencia_completa' ||
    s === 'calibracao_diferente' ||
    s === 'nao_avaliavel'
    ? s
    : 'sem_referencia'
}

export type EstadoAvaliado = 'normal' | 'atencao' | 'alarme'

/** Estado que a API deu ao ponto; nulo quando não foi avaliado. */
export function estadoAvaliado(
  avaliacao: { situacao: string; estado?: string | null } | null | undefined,
): EstadoAvaliado | null {
  if (avaliacao?.situacao !== 'avaliada') return null
  const e = avaliacao.estado
  return e === 'normal' || e === 'atencao' || e === 'alarme' ? e : null
}

export type ChaveDoPonto =
  | 'sem_dados'
  | 'velho'
  | 'instrumento'
  | Exclude<Situacao, 'avaliada'>
  | EstadoAvaliado

export type AparenciaDoPonto = {
  chave: ChaveDoPonto
  rotulo: string
  forma: Forma
  tom: Tom
  /** Contorno tracejado: o estado não é uma avaliação (falta referência, dado velho...). */
  tracejado: boolean
  /** O que fazer, em uma frase; nulo quando não há nada a fazer. */
  oQueFazer: string | null
  /** Valores em cinza claro: o número na tela pode não ser o atual. */
  valoresApagados: boolean
}

export type EntradaDoPonto = {
  frescor: Frescor
  /** Segundos desde a última janela (para o texto do dado velho). */
  idadeS: number | null
  avaliacao: { situacao: string; estado?: string | null; generica?: boolean } | null | undefined
  /** Alerta de instrumento ativo neste ponto (sensor solto, caído ou com defeito). */
  instrumento: { acao_recomendada: string } | null
}

const SITUACAO: Record<
  Exclude<Situacao, 'avaliada'>,
  Pick<AparenciaDoPonto, 'rotulo' | 'oQueFazer'>
> = {
  sem_referencia: {
    rotulo: 'SEM REFERÊNCIA',
    oQueFazer:
      'A API ainda não aprendeu o normal deste ponto nesta marcha, então nada vira atenção ou alarme. Grave ensaios normais e recalcule a referência no painel (Coleta).',
  },
  sem_referencia_completa: {
    rotulo: 'SEM REFERÊNCIA COMPLETA',
    oQueFazer:
      'Falta o normal do giro em vazio (T1) ou do corte (T3) nesta marcha. Grave o que falta e recalcule a referência no painel.',
  },
  calibracao_diferente: {
    rotulo: 'CALIBRAÇÃO DIFERENTE',
    oQueFazer:
      'O sensor foi calibrado de novo depois da referência e os números não são mais comparáveis. Recalcule a referência no painel.',
  },
  nao_avaliavel: {
    rotulo: 'NÃO AVALIÁVEL',
    oQueFazer:
      'Esta janela não pôde ser comparada (saturou, faltaram amostras ou a rotação está fora da marcha). Se repetir, confira o sensor.',
  },
}

/** Ordem de decisão: sem dado, dado velho, instrumento, situação sem avaliação, estado avaliado. */
export function aparenciaDoPonto(entrada: EntradaDoPonto, formatarIdade: (s: number) => string): AparenciaDoPonto {
  if (entrada.frescor === 'ausente') {
    return {
      chave: 'sem_dados',
      rotulo: 'SEM DADOS',
      forma: 'anel',
      tom: 'apagado',
      tracejado: true,
      oQueFazer: 'Nenhuma janela recebida desta fonte. Confira se o dispositivo está ligado e na rede.',
      valoresApagados: true,
    }
  }
  if (entrada.frescor === 'velho') {
    const ha = entrada.idadeS === null ? '' : ` há ${formatarIdade(entrada.idadeS)}`
    return {
      chave: 'velho',
      rotulo: 'DADO VELHO',
      forma: 'anel',
      tom: 'apagado',
      tracejado: true,
      oQueFazer: `Sem dados${ha}: o valor na tela pode não ser o atual. Confira se o dispositivo está ligado e na rede.`,
      valoresApagados: true,
    }
  }
  if (entrada.instrumento) {
    return {
      chave: 'instrumento',
      rotulo: 'INSTRUMENTO',
      forma: 'quadrado',
      tom: 'info',
      tracejado: false,
      oQueFazer: entrada.instrumento.acao_recomendada,
      valoresApagados: false,
    }
  }
  const situacao = situacaoDoPonto(entrada.avaliacao)
  if (situacao !== 'avaliada') {
    return {
      chave: situacao,
      ...SITUACAO[situacao],
      forma: 'circulo',
      tom: 'neutro',
      tracejado: true,
      valoresApagados: false,
    }
  }
  const estado = estadoAvaliado(entrada.avaliacao) ?? 'normal'
  const generica = entrada.avaliacao?.generica ? ' Comparado com o corte de todas as receitas (referência genérica).' : ''
  if (estado === 'alarme')
    return {
      chave: 'alarme',
      rotulo: 'ALARME',
      forma: 'losango',
      tom: 'alarme',
      tracejado: false,
      oQueFazer: `Muito acima do típico. Veja a ação recomendada em Alarmes.${generica}`,
      valoresApagados: false,
    }
  if (estado === 'atencao')
    return {
      chave: 'atencao',
      rotulo: 'ATENÇÃO',
      forma: 'triangulo',
      tom: 'atencao',
      tracejado: false,
      oQueFazer: `Acima do típico. Veja a ação recomendada em Alarmes.${generica}`,
      valoresApagados: false,
    }
  return {
    chave: 'normal',
    rotulo: 'NORMAL',
    forma: 'circulo',
    tom: 'neutro',
    tracejado: false,
    oQueFazer: generica ? generica.trim() : null,
    valoresApagados: false,
  }
}

// ------------------------------------------------------------------ régua de desvio (em z)

export type Limites = { z_atencao: number; z_alarme: number }

/** Maior z entre as medidas avaliadas da janela; nulo se nenhuma tem z. */
export function zMaximo(z: Record<string, number> | null | undefined): number | null {
  if (!z) return null
  const valores = Object.values(z).filter((v) => Number.isFinite(v))
  return valores.length === 0 ? null : Math.max(...valores)
}

/** Desvio de um z pelos limites da API: só acima do limite vira atenção ou alarme. */
export function desvioDoZ(
  z: number | null | undefined,
  limites: Limites | null | undefined,
): 'atencao' | 'alarme' | null {
  if (!limites || z === null || z === undefined || !Number.isFinite(z)) return null
  if (z >= limites.z_alarme) return 'alarme'
  return z >= limites.z_atencao ? 'atencao' : null
}

/**
 * Régua em z: o centro é o típico (z = 0), a faixa de tolerância vai de −z_atencao a +z_atencao e as
 * marcas são os limites de atenção e de alarme da API. Devolve posições de 0 a 1.
 */
export function regua(z: number | null | undefined, limites: Limites) {
  const alcance = Math.max(limites.z_alarme * 1.4, limites.z_atencao + 1)
  const pos = (v: number) => Math.min(1, Math.max(0, (v + alcance) / (2 * alcance)))
  const temZ = z !== null && z !== undefined && Number.isFinite(z)
  return {
    ponteiro: temZ ? pos(z) : null,
    /** O ponteiro passou do fim da escala: a ponta vira seta. */
    fora: temZ ? Math.abs(z) > alcance : false,
    toleranciaInicio: pos(-limites.z_atencao),
    toleranciaFim: pos(limites.z_atencao),
    marcaAtencao: pos(limites.z_atencao),
    marcaAlarme: pos(limites.z_alarme),
    tom: desvioDoZ(z, limites),
  }
}

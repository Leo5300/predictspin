/**
 * Coleta no celular, ao lado do torno: pré-voo, grade de cobertura, próxima gravação sugerida,
 * cronômetro e fita. Os valores aceitos (etapas, condições, motivos de evento) vêm do contrato
 * (src/api/enumeracoes.ts, gerado); a contagem da cobertura e o uso de cada condição vêm da API. Aqui
 * ficam só os nomes para mostrar e a regra do protocolo que o painel também segue
 * (painel/src/dominio/coleta.ts): a condição só muda o corte (T0, T1 e T2 são sempre "normal") e T0 é o
 * torno desligado (rotação alvo 0).
 */

export const ROTULO_ETAPA: Record<string, string> = {
  T0: 'Torno desligado',
  T1: 'Girando em vazio',
  T2: 'Aproximação sem contato',
  T3: 'Corte',
}

export const ROTULO_CONDICAO: Record<string, string> = {
  normal: 'Normal',
  ferramenta_desgastada: 'Ferramenta desgastada',
  avanco_excessivo: 'Avanço excessivo',
  rotacao_inadequada: 'Rotação inadequada',
  desbalanceamento: 'Desbalanceamento',
  sensor_solto: 'Sensor solto (só validação)',
}

export const ROTULO_MOTIVO: Record<string, string> = {
  pancada: 'Pancada',
  cavaco: 'Cavaco',
  maquina_vizinha: 'Máquina vizinha',
  outro: 'Outro',
}

export function nomeDe(rotulos: Record<string, string>, valor: string): string {
  return rotulos[valor] ?? valor.replaceAll('_', ' ')
}

/** Condições que valem para a etapa: só o corte (T3) tem outra além de normal. */
export function condicoesDaEtapa(etapa: string, todas: readonly string[]): string[] {
  return etapa === 'T3' ? [...todas] : todas.filter((c) => c === 'normal')
}

/** Rotação alvo da etapa: T0 é o torno desligado. */
export function rotacaoDaEtapa(etapa: string, rotacao: number): number {
  return etapa === 'T0' ? 0 : rotacao
}

// ------------------------------------------------------------------ cobertura

export type ItemDaApi = {
  etapa: string
  condicao: string
  rotacao_alvo_rpm: number
  ensaios_validos: number
  uso: string
}

export type Celula = {
  etapa: string
  condicao: string
  rotacao: number
  uso: string
  validos: number
  meta: number
  faltam: number
}

export const chaveDaCelula = (c: { etapa: string; condicao: string; rotacao: number }) =>
  `${c.etapa}|${c.condicao}|${c.rotacao}`

/**
 * Grade válida pelo protocolo, na ordem da sugestão (T0 → T1 → T2 → T3; rotações crescentes; no T3,
 * na ordem das condições do contrato), com a contagem e o uso que a API devolveu para cada célula.
 */
export function gradeDeCobertura(
  itens: readonly ItemDaApi[],
  rotacoesDaApi: readonly number[],
  meta: number,
  etapas: readonly string[],
  condicoes: readonly string[],
): Celula[] {
  const daApi = new Map(itens.map((i) => [chaveDaCelula({ ...i, rotacao: i.rotacao_alvo_rpm }), i]))
  const rotacoes = [...new Set(rotacoesDaApi.filter((r) => r > 0))].sort((a, b) => a - b)
  const celula = (etapa: string, condicao: string, rotacao: number): Celula => {
    const item = daApi.get(chaveDaCelula({ etapa, condicao, rotacao }))
    const validos = item?.ensaios_validos ?? 0
    return { etapa, condicao, rotacao, uso: item?.uso ?? 'treino', validos, meta, faltam: Math.max(0, meta - validos) }
  }
  const grade: Celula[] = []
  for (const etapa of etapas) {
    if (etapa === 'T0') {
      grade.push(celula('T0', 'normal', 0))
      continue
    }
    for (const condicao of condicoesDaEtapa(etapa, condicoes)) {
      for (const rotacao of rotacoes) grade.push(celula(etapa, condicao, rotacao))
    }
  }
  return grade
}

/** A célula com menos ensaios em relação à meta; no empate, a primeira da grade. Completa: nenhuma. */
export function proximaSugerida(grade: readonly Celula[]): Celula | null {
  let melhor: Celula | null = null
  for (const c of grade) {
    if (c.faltam <= 0) continue
    if (!melhor || c.validos / c.meta < melhor.validos / melhor.meta) melhor = c
  }
  return melhor
}

// ------------------------------------------------------------------ pré-voo

/** Tolerância da rotação em torno do alvo, e abaixo de quanto o torno conta como parado (as do painel). */
export const TOLERANCIA_ROTACAO = 0.1
export const ROTACAO_PARADA_RPM = 20

export type EstadoDoItem = 'ok' | 'aviso' | 'bloqueia'

export type ItemDoPreVoo = {
  chave: string
  rotulo: string
  estado: EstadoDoItem
  detalhe: string
  oQueFazer?: string
}

export type EntradaDoPreVoo = {
  /** Última janela, só se estiver viva (chegou há pouco). */
  janela: { rotacao_rpm: number; pontos: Record<string, unknown> } | null
  etapa: string
  rotacaoAlvo: number
  pontos: readonly string[]
}

const rpm = (n: number) => `${Math.round(n)} rpm`

/**
 * Uma linha por sensor e a rotação, a partir da última janela: A, B e C chegando, FC-51 contando voltas e
 * a rotação perto do alvo. Sem dado vivo, tudo bloqueia; o resto só avisa e diz o que fazer.
 */
export function preVoo(e: EntradaDoPreVoo): ItemDoPreVoo[] {
  const j = e.janela
  const semDado: Omit<ItemDoPreVoo, 'chave' | 'rotulo'> = {
    estado: 'bloqueia',
    detalhe: 'sem dado vivo',
    oQueFazer: 'Confira se o dispositivo está ligado e no Wi-Fi.',
  }
  const itens: ItemDoPreVoo[] = e.pontos.map((p) =>
    !j
      ? { chave: p, rotulo: `Ponto ${p}`, ...semDado }
      : p in j.pontos
        ? { chave: p, rotulo: `Ponto ${p}`, estado: 'ok', detalhe: 'chegando' }
        : {
            chave: p,
            rotulo: `Ponto ${p}`,
            estado: 'aviso',
            detalhe: 'faltou na última janela',
            oQueFazer: `Confira o cabo e a fixação do sensor ${p}.`,
          },
  )
  if (!j) {
    itens.push({ chave: 'fc51', rotulo: 'FC-51 (rotação)', ...semDado })
    itens.push({ chave: 'rotacao', rotulo: 'Rotação', ...semDado })
    return itens
  }
  const parado = j.rotacao_rpm < ROTACAO_PARADA_RPM
  if (e.etapa === 'T0') {
    itens.push({ chave: 'fc51', rotulo: 'FC-51 (rotação)', estado: 'ok', detalhe: 'torno parado, sem voltas a contar' })
    itens.push(
      parado
        ? { chave: 'rotacao', rotulo: 'Rotação 0', estado: 'ok', detalhe: rpm(j.rotacao_rpm) }
        : {
            chave: 'rotacao',
            rotulo: 'Rotação 0',
            estado: 'aviso',
            detalhe: rpm(j.rotacao_rpm),
            oQueFazer: 'No T0 o torno fica desligado.',
          },
    )
    return itens
  }
  itens.push(
    parado
      ? {
          chave: 'fc51',
          rotulo: 'FC-51 (rotação)',
          estado: 'aviso',
          detalhe: 'nenhuma volta contada',
          oQueFazer: 'Ligue o torno; se ele já gira, confira a faixa refletiva e a distância do FC-51.',
        }
      : { chave: 'fc51', rotulo: 'FC-51 (rotação)', estado: 'ok', detalhe: 'contando voltas' },
  )
  const desvio = e.rotacaoAlvo > 0 ? Math.abs(j.rotacao_rpm - e.rotacaoAlvo) / e.rotacaoAlvo : 1
  itens.push(
    desvio <= TOLERANCIA_ROTACAO
      ? { chave: 'rotacao', rotulo: `Rotação perto de ${rpm(e.rotacaoAlvo)}`, estado: 'ok', detalhe: rpm(j.rotacao_rpm) }
      : {
          chave: 'rotacao',
          rotulo: `Rotação perto de ${rpm(e.rotacaoAlvo)}`,
          estado: 'aviso',
          detalhe: rpm(j.rotacao_rpm),
          oQueFazer: 'Confira a marcha do torno e espere a rotação estabilizar.',
        },
  )
  return itens
}

/** Por que o botão de gravar está desligado (só o que bloqueia), ou nulo se pode gravar. */
export function porQueNaoGrava(itens: readonly ItemDoPreVoo[], semConexao: boolean): string | null {
  if (semConexao) return 'Sem conexão com a API: o ensaio é aberto na API.'
  const bloqueia = itens.find((i) => i.estado === 'bloqueia')
  return bloqueia ? `${bloqueia.rotulo}: ${bloqueia.detalhe}. ${bloqueia.oQueFazer ?? ''}`.trim() : null
}

export function avisosDoPreVoo(itens: readonly ItemDoPreVoo[]): string[] {
  return itens.filter((i) => i.estado === 'aviso').map((i) => i.rotulo)
}

// ------------------------------------------------------------------ gravação

/** Cronômetro "MM:SS" (ou "H:MM:SS" passando de uma hora). */
export function formatarCronometro(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const dois = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${dois(m)}:${dois(s % 60)}` : `${dois(m)}:${dois(s % 60)}`
}

/** A fita mostra as últimas janelas do ensaio, uma por traço; saturada leva marca. */
export const TRACOS_DA_FITA = 48

export function fita(janelas: readonly { id: number; saturou: boolean }[]): { id: number; saturou: boolean }[] {
  return janelas.slice(-TRACOS_DA_FITA)
}

/**
 * DADOS DE EXEMPLO DA GALERIA. Inventados para mostrar cada componente em cada estado; não vêm da API
 * e não representam nenhuma medição. Só a galeria (página de desenvolvimento) importa este arquivo,
 * e um teste confere que nada daqui entra no build de produção.
 */
import type { Alarme, OrdemServico } from '@/api/adaptadores/alarmes'
import type { IntervaloDoMapa, LinhaDoMapa } from '@/componentes/instrumento/MapaOrdens'
import type { Referencia } from '@/dominio/estado'

/** Marca procurada no build de produção pelo teste: se aparecer lá, a galeria vazou. */
export const MARCA_DA_GALERIA = 'galeria-de-componentes-somente-desenvolvimento'

export const REFERENCIA_EXEMPLO: Referencia = {
  centro: 0.05,
  tolerancia: 0.012,
  atencao: 0.08,
  alarme: 0.11,
}

/** Série determinística (sem sorteio): o print da galeria sai igual em toda execução. */
export function serieExemplo(n: number, base: number, amplitude: number, fase = 0): number[] {
  return Array.from(
    { length: n },
    (_, i) =>
      base + amplitude * Math.sin(i / 4 + fase) + amplitude * 0.4 * Math.sin(i * 1.7 + fase),
  )
}

export const SPARK_NORMAL = serieExemplo(60, 0.05, 0.006)
export const SPARK_COM_LACUNA: (number | null)[] = SPARK_NORMAL.map((v, i) =>
  i > 22 && i < 34 ? null : v,
)

export const RASTRO_NORMAL = serieExemplo(12, 0.052, 0.004)
export const RASTRO_ALARME = serieExemplo(12, 0.118, 0.006)

const INICIO_MAPA = Date.parse('2026-11-12T10:00:00Z')

export const INTERVALOS_MAPA: IntervaloDoMapa[] = Array.from({ length: 60 }, (_, i) => ({
  inicio: new Date(INICIO_MAPA + i * 30_000).toISOString(),
  fim: new Date(INICIO_MAPA + (i + 1) * 30_000).toISOString(),
  janelas: i >= 18 && i < 25 ? 0 : 6,
  saturou: i === 44 || i === 45,
  rotacaoRpm: i >= 18 && i < 25 ? null : 1120,
}))

function linha(
  ponto: string,
  grandeza: string,
  base: number,
  pico: number,
  referencia: Referencia | null,
): LinhaDoMapa {
  return {
    chave: `${ponto}-${grandeza}`,
    ponto,
    grandeza,
    valores: INTERVALOS_MAPA.map((intervalo, i) => {
      if (intervalo.janelas === 0) return null
      const subida = i > 40 ? (i - 40) * pico : 0
      return base + 0.2 * base * Math.sin(i / 3) + subida
    }),
    referencia,
  }
}

export const LINHAS_MAPA_COM_REFERENCIA: LinhaDoMapa[] = [
  linha('A', 'RMS', 0.05, 0.0035, REFERENCIA_EXEMPLO),
  linha('A', '1X', 0.04, 0.0012, { centro: 0.04, tolerancia: 0.01, atencao: 0.06, alarme: 0.08 }),
  linha('B', 'RMS', 0.05, 0.0005, REFERENCIA_EXEMPLO),
]

// ---- cenários do mapa de ordens comparado com o típico (todos inventados, só para a galeria)

type Cenario = {
  /** Marcha (rpm medidos) de cada intervalo; nulo = lacuna. */
  rotacao: (i: number) => number | null
  /** Valor da linha no intervalo, a partir da base da linha. */
  valor: (ponto: string, base: number, i: number) => number
  saturou?: (i: number) => boolean
}

const PONTOS_E_BASES: [string, string, number][] = [
  ['A', 'RMS', 0.05],
  ['A', '1X', 0.04],
  ['A', '2X', 0.015],
  ['A', '3X', 0.007],
  ['B', 'RMS', 0.08],
  ['B', '1X', 0.06],
  ['B', '2X', 0.025],
  ['B', '3X', 0.015],
  ['C', 'RMS', 0.04],
  ['C', '1X', 0.035],
  ['C', '2X', 0.014],
  ['C', '3X', 0.008],
]

/** Ruído pequeno (±4 %), determinístico. */
const ruido = (i: number, base: number) => base * 0.04 * Math.sin(i * 1.3 + base * 100)

function cenarioDoMapa(c: Cenario): { intervalos: IntervaloDoMapa[]; linhas: LinhaDoMapa[] } {
  const intervalos = Array.from({ length: 60 }, (_, i) => {
    const rotacao = c.rotacao(i)
    return {
      inicio: new Date(INICIO_MAPA + i * 30_000).toISOString(),
      fim: new Date(INICIO_MAPA + (i + 1) * 30_000).toISOString(),
      janelas: rotacao === null ? 0 : 6,
      saturou: c.saturou?.(i) ?? false,
      rotacaoRpm: rotacao,
    }
  })
  const linhas = PONTOS_E_BASES.map(([ponto, grandeza, base]) => ({
    chave: `${ponto}-${grandeza}`,
    ponto,
    grandeza,
    valores: intervalos.map((intervalo, i) =>
      intervalo.janelas === 0 ? null : c.valor(ponto, base, i) + ruido(i, base),
    ),
    referencia: null,
  }))
  return { intervalos, linhas }
}

export const MAPA_NORMAL = cenarioDoMapa({ rotacao: () => 1178, valor: (_, b) => b })

/** Troca de 1120 para 450 rpm no meio: todas as linhas mudam de nível, mas é a marcha. */
export const MAPA_TROCA_DE_MARCHA = cenarioDoMapa({
  rotacao: (i) => (i < 30 ? 1178 : 452),
  valor: (_, b, i) => (i < 30 ? b : b * 0.45),
})

/** Só as linhas do B sobem a partir do intervalo 40 (corte com avanço acima do recomendado). */
export const MAPA_B_FUGINDO = cenarioDoMapa({
  rotacao: () => 1178,
  valor: (ponto, b, i) => (ponto === 'B' && i >= 40 ? b * (1.2 + (i - 40) * 0.03) : b),
})

/** O ponto C cai para 60 % do típico num trecho (abaixo do típico: pontilhado). */
export const MAPA_ABAIXO = cenarioDoMapa({
  rotacao: () => 1178,
  valor: (ponto, b, i) => (ponto === 'C' && i >= 20 && i < 35 ? b * 0.6 : b),
})

/** Lacuna entre os intervalos 18 e 24 e saturação em 44 e 45. */
export const MAPA_LACUNA_E_SATURACAO = cenarioDoMapa({
  rotacao: (i) => (i >= 18 && i < 25 ? null : 1178),
  valor: (_, b, i) => (i === 44 || i === 45 ? b * 1.6 : b),
  saturou: (i) => i === 44 || i === 45,
})

export const ENSAIOS_MAPA_EXEMPLO = [
  {
    inicio: new Date(INICIO_MAPA + 40 * 30_000).toISOString(),
    fim: new Date(INICIO_MAPA + 55 * 30_000).toISOString(),
    codigo: 'TORNO-01-T3-00012',
    etapa: 'T3',
  },
]

export const EVENTOS_MAPA_EXEMPLO = [
  { instante: new Date(INICIO_MAPA + 47 * 30_000 + 9_000).toISOString(), motivo: 'pancada' },
]

const INICIO_TENDENCIA = Date.parse('2026-11-12T10:00:00Z') / 1000

export const TEMPOS_TENDENCIA: number[] = Array.from(
  { length: 120 },
  (_, i) => INICIO_TENDENCIA + i * 5,
)

/** Lacuna entre as amostras 50 e 64: a linha tem de ser interrompida ali. */
export const RMS_TENDENCIA: (number | null)[] = serieExemplo(120, 0.06, 0.008).map((v, i) =>
  i >= 50 && i < 64 ? null : v,
)
export const PICO_TENDENCIA: (number | null)[] = serieExemplo(120, 0.19, 0.03, 1).map((v, i) =>
  i >= 50 && i < 64 ? null : v,
)

export const NOME_MUITO_LONGO = 'TORNO-CNC-ROMI-GL-280-LINHA-DE-USINAGEM-PESADA-SETOR-B-POSICAO-14'
export const NUMERO_ENORME = 987_654_321.123

/**
 * Pior caso da tela da máquina a 390 px: valores com dois dígitos inteiros e pico, 1X, 2X e 3X em
 * desvio (a forma do estado ocupa largura ao lado do número). Valores de exemplo, não medidos.
 */
export const LEITURAS_EM_DESVIO = {
  rms_g: 12.345,
  pico_g: 15.987,
  curtose: 12.34,
  o1x: 10.876,
  o2x: 18.765,
  o3x: 17.654,
}

/** Rotações nominais de exemplo (as mesmas da placa do torno, para o tacômetro da galeria). */
export const NOMINAIS_EXEMPLO = [
  45, 71, 90, 112, 140, 180, 224, 265, 280, 355, 450, 560, 710, 900, 1120, 1400, 1800, 2240,
]

// ---- alarmes e ordens de serviço (exemplos inventados, só a galeria mostra)

const ACAO_EXEMPLO = 'Exemplo: conferir a fixação e o balanceamento da peça na placa'

const alarme = (
  id: number,
  estado: Alarme['estado'],
  nivel: Alarme['nivel'],
  tipo: 'maquina' | 'instrumento' = 'maquina',
  condicao: string | null = null,
): Alarme => ({
  id,
  maquina_id: 1,
  maquina: 'TORNO-01',
  ponto: 'A',
  tipo,
  prioridade: tipo === 'maquina' && nivel === 'alarme' ? 'alta' : 'baixa',
  estado,
  nivel,
  pior_nivel: nivel,
  z: nivel === 'alarme' ? 6.2 : 3.8,
  pior_z: nivel === 'alarme' ? 6.2 : 3.8,
  metrica: tipo === 'instrumento' ? 'instrumento' : 'o1x',
  valor: nivel === 'alarme' ? 0.118 : 0.083,
  explicacao:
    tipo === 'instrumento'
      ? 'Exemplo: sensor A sumiu do envio enquanto os outros pontos continuaram chegando.'
      : 'Exemplo: A·1X 6,2σ acima do típico da marcha 1120.',
  acao_recomendada: ACAO_EXEMPLO,
  componente: 'eixo-árvore e mancal dianteiro',
  referencia_versao: 1,
  firmware_versao: null,
  calibracao: null,
  ensaio_id: null,
  condicao_ensaio: condicao,
  durante_ensaio_de_condicao: condicao !== null,
  simulado: false,
  janela_id: 1,
  criado_em: '2026-11-12T10:14:05Z',
  atualizado_em: null,
  reconhecido_em: estado === 'ativo_reconhecido' ? '2026-11-12T10:15:00Z' : null,
  reconhecido_por: null,
  normalizado_em: estado === 'normalizado_nao_reconhecido' ? '2026-11-12T10:18:00Z' : null,
  encerrado_em: null,
  suprimido_ate: estado === 'suprimido' ? '2026-11-12T11:14:05Z' : null,
  motivo_supressao: estado === 'suprimido' ? 'Exemplo: máquina ao lado em manutenção' : null,
  suprimido_por: null,
  ordem_servico_id: null,
})

export const ALARMES_EXEMPLO: Alarme[] = [
  alarme(1, 'ativo_nao_reconhecido', 'alarme'),
  alarme(2, 'ativo_nao_reconhecido', 'atencao', 'maquina', 'avanco_excessivo'),
  alarme(3, 'ativo_reconhecido', 'alarme'),
  alarme(4, 'normalizado_nao_reconhecido', 'atencao'),
  alarme(5, 'suprimido', 'alarme'),
  alarme(6, 'ativo_nao_reconhecido', 'atencao', 'instrumento'),
]

const ordem = (
  id: number,
  retorno: OrdemServico['retorno_tecnico'],
  status: OrdemServico['status'],
): OrdemServico => ({
  id,
  numero: `OS-2026-${String(id).padStart(4, '0')}`,
  maquina_id: 1,
  maquina: 'TORNO-01',
  ponto: 'A',
  componente: 'eixo-árvore e mancal dianteiro',
  status,
  motivo_abertura: 'alarme_continuo',
  alerta_id: 1,
  explicacao: 'Exemplo: A·1X 6,2σ acima do típico da marcha 1120.',
  acao_recomendada: ACAO_EXEMPLO,
  severidade_acumulada: 640,
  referencia_versao: 1,
  firmware_versao: null,
  calibracao: null,
  simulado: false,
  responsavel: status === 'aberta' ? null : 'Exemplo de técnico',
  aberta_em: '2026-11-12T10:20:00Z',
  assumida_em: status === 'aberta' ? null : '2026-11-12T10:25:00Z',
  concluida_em: status === 'concluida' ? '2026-11-12T11:00:00Z' : null,
  retorno_tecnico: retorno,
  comentario_tecnico: retorno ? 'Exemplo: peça desbalanceada, recolocada na placa.' : null,
  condicao_encontrada: retorno === 'confirmada' ? 'desbalanceamento' : null,
})

export const ORDENS_EXEMPLO: OrdemServico[] = [
  ordem(12, null, 'aberta'),
  ordem(13, 'confirmada', 'concluida'),
  ordem(14, 'rejeitada', 'concluida'),
]

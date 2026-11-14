/**
 * DADOS DE EXEMPLO DA GALERIA. Inventados para mostrar cada componente em cada estado; não vêm da API
 * e não representam nenhuma medição. Só a galeria (página de desenvolvimento) importa este arquivo,
 * e um teste confere que nada daqui entra no build de produção.
 */
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

export const LINHAS_MAPA_SEM_REFERENCIA: LinhaDoMapa[] = [
  linha('A', 'RMS', 0.05, 0.0015, null),
  linha('A', '1X', 0.04, 0.0012, null),
  linha('B', 'RMS', 0.08, 0.0008, null),
  linha('B', '1X', 0.06, 0.0004, null),
]

export const LINHAS_MAPA_COM_REFERENCIA: LinhaDoMapa[] = [
  linha('A', 'RMS', 0.05, 0.0035, REFERENCIA_EXEMPLO),
  linha('A', '1X', 0.04, 0.0012, { centro: 0.04, tolerancia: 0.01, atencao: 0.06, alarme: 0.08 }),
  linha('B', 'RMS', 0.05, 0.0005, REFERENCIA_EXEMPLO),
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

/** Rotações nominais de exemplo (as mesmas da placa do torno, para o tacômetro da galeria). */
export const NOMINAIS_EXEMPLO = [
  45, 71, 90, 112, 140, 180, 224, 265, 280, 355, 450, 560, 710, 900, 1120, 1400, 1800, 2240,
]

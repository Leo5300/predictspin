/**
 * Formatação para a interface em português do Brasil: vírgula decimal, ponto de milhar e hora no
 * fuso do navegador (a API fala UTC). Valor ausente ou inválido vira travessão, nunca "NaN".
 */

export const TRACO = '—'

const LOCALE = 'pt-BR'
const LIMITE_COMPACTO = 100_000

const formatadores = new Map<string, Intl.NumberFormat>()

function formatador(casas: number, compacto: boolean): Intl.NumberFormat {
  const chave = `${casas}|${compacto}`
  let f = formatadores.get(chave)
  if (!f) {
    f = new Intl.NumberFormat(
      LOCALE,
      compacto
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { minimumFractionDigits: casas, maximumFractionDigits: casas },
    )
    formatadores.set(chave, f)
  }
  return f
}

/** Número com casas fixas. Acima de cem mil usa a forma compacta ("123,5 mil") para caber na leitura. */
export function formatarNumero(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  return formatador(casas, Math.abs(valor) >= LIMITE_COMPACTO).format(valor)
}

/** Aceleração em g, com três casas (resolução útil do ADXL345 depois da média da janela). */
export function formatarG(valor: number | null | undefined): string {
  return formatarNumero(valor, 3)
}

export function formatarRpm(valor: number | null | undefined): string {
  return formatarNumero(valor, 0)
}

export function formatarCurtose(valor: number | null | undefined): string {
  return formatarNumero(valor, 2)
}

/** Fração (0 a 1) como porcentagem inteira; nulo se o denominador não serve. */
export function fracao(
  parte: number | null | undefined,
  total: number | null | undefined,
): number | null {
  if (
    parte === null ||
    parte === undefined ||
    total === null ||
    total === undefined ||
    total <= 0
  ) {
    return null
  }
  return parte / total
}

export function formatarPercentual(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  return `${formatarNumero(valor * 100, casas)} %`
}

/** Idade de um dado em palavras curtas: "8 s", "4 min", "3 h", "2 d". */
export function formatarIdade(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return TRACO
  const s = Math.max(0, Math.floor(segundos))
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86_400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86_400)} d`
}

/** Contagem regressiva em m:ss ("1:58"). */
export function formatarPrazo(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const HORA = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const HORA_MINUTO = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const DATA_HORA = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const DATA = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })

function paraData(instante: string | number | Date | null | undefined): Date | null {
  if (instante === null || instante === undefined) return null
  const data = instante instanceof Date ? instante : new Date(instante)
  return Number.isNaN(data.getTime()) ? null : data
}

/** Hora local com segundos: "14:03:27". */
export function formatarHora(instante: string | number | Date | null | undefined): string {
  const data = paraData(instante)
  return data ? HORA.format(data) : TRACO
}

/** Hora local sem segundos: "14:03". */
export function formatarHoraMinuto(instante: string | number | Date | null | undefined): string {
  const data = paraData(instante)
  return data ? HORA_MINUTO.format(data) : TRACO
}

/** Dia, mês e hora local: "12/11 14:03:27". */
export function formatarDataHora(instante: string | number | Date | null | undefined): string {
  const data = paraData(instante)
  return data ? DATA_HORA.format(data).replace(',', '') : TRACO
}

export function formatarData(instante: string | number | Date | null | undefined): string {
  const data = paraData(instante)
  return data ? DATA.format(data) : TRACO
}

/** Duração de um intervalo de agregação: "15 s", "1 min", "2,5 min". */
export function formatarIntervalo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) return TRACO
  if (segundos < 60) return `${formatarNumero(segundos, Number.isInteger(segundos) ? 0 : 1)} s`
  const minutos = segundos / 60
  if (minutos < 60) return `${formatarNumero(minutos, Number.isInteger(minutos) ? 0 : 1)} min`
  const horas = minutos / 60
  return `${formatarNumero(horas, Number.isInteger(horas) ? 0 : 1)} h`
}

/**
 * Formatação para a tela em português do Brasil: vírgula decimal, ponto de milhar, data dd/mm e hora
 * no fuso do aparelho (a API fala UTC). Valor ausente ou inválido vira travessão, nunca "NaN".
 *
 * Feito à mão, sem Intl: o Intl do Hermes não tem as mesmas opções no iPhone e no Android (a forma
 * compacta, por exemplo), e a tela não pode mudar de um aparelho para outro.
 */

export const TRACO = '—'

function valido(valor: number | null | undefined): valor is number {
  return valor !== null && valor !== undefined && Number.isFinite(valor)
}

function milhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Número com casas fixas, vírgula decimal e ponto de milhar ("1.234,568"). */
export function formatarNumero(valor: number | null | undefined, casas = 0): string {
  if (!valido(valor)) return TRACO
  const fixo = Math.abs(valor).toFixed(casas)
  const [inteiro = '0', fracao] = fixo.split('.')
  const corpo = fracao ? `${milhar(inteiro)},${fracao}` : milhar(inteiro)
  // "-0,000" não existe: zero arredondado não leva sinal
  const negativo = valor < 0 && Number(fixo) !== 0
  return negativo ? `-${corpo}` : corpo
}

/** Aceleração em g, com três casas (resolução útil do ADXL345 depois da média da janela). */
export function formatarG(valor: number | null | undefined): string {
  return formatarNumero(valor, 3)
}

/**
 * Rotação inteira, sem separador de milhar (1180 rpm, não 1.180): é assim que a placa do torno e o
 * operador escrevem a rotação, e evita confundir o ponto de milhar com vírgula decimal.
 */
export function formatarRpm(valor: number | null | undefined): string {
  if (!valido(valor)) return TRACO
  return String(Math.round(valor))
}

export function formatarCurtose(valor: number | null | undefined): string {
  return formatarNumero(valor, 2)
}

export function formatarVelocidade(valor: number | null | undefined): string {
  return formatarNumero(valor, 2)
}

/** z da medida, com uma casa ("4,2"). */
export function formatarZ(valor: number | null | undefined): string {
  return formatarNumero(valor, 1)
}

/** Fração de 0 a 1 como porcentagem inteira ("78 %"). */
export function formatarPercentual(valor: number | null | undefined, casas = 0): string {
  if (!valido(valor)) return TRACO
  return `${formatarNumero(valor * 100, casas)} %`
}

/** Idade de um dado em palavras curtas: "8 s", "4 min", "3 h", "2 d". */
export function formatarIdade(segundos: number | null | undefined): string {
  if (!valido(segundos)) return TRACO
  const s = Math.max(0, Math.floor(segundos))
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86_400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86_400)} d`
}

/** Prazo em minutos para rótulo: "15 min", "1 h", "4 h", "1 dia", "7 dias", "90 min". */
export function formatarMinutos(minutos: number): string {
  if (minutos >= 1440 && minutos % 1440 === 0) {
    const dias = minutos / 1440
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`
  }
  if (minutos >= 60 && minutos % 60 === 0) return `${minutos / 60} h`
  return `${minutos} min`
}

/** Espera em segundos para um aviso: "40 s", "3 min", "1 min 30 s". */
export function formatarEspera(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  const resto = s % 60
  return resto === 0 ? `${min} min` : `${min} min ${resto} s`
}

function paraData(instante: string | number | Date | null | undefined): Date | null {
  if (instante === null || instante === undefined) return null
  const data = instante instanceof Date ? instante : new Date(instante)
  return Number.isNaN(data.getTime()) ? null : data
}

const dois = (n: number) => String(n).padStart(2, '0')

/** Hora local com segundos: "14:03:27". */
export function formatarHora(instante: string | number | Date | null | undefined): string {
  const d = paraData(instante)
  return d ? `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}` : TRACO
}

/** Hora local sem segundos: "14:03". */
export function formatarHoraMinuto(instante: string | number | Date | null | undefined): string {
  const d = paraData(instante)
  return d ? `${dois(d.getHours())}:${dois(d.getMinutes())}` : TRACO
}

/** Dia, mês e hora local: "12/11 14:03". */
export function formatarDataHora(instante: string | number | Date | null | undefined): string {
  const d = paraData(instante)
  return d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${formatarHoraMinuto(d)}` : TRACO
}

/** Data completa: "12/11/2026". */
export function formatarData(instante: string | number | Date | null | undefined): string {
  const d = paraData(instante)
  return d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` : TRACO
}

/** Há quanto tempo, a partir de um instante da API e do relógio do aparelho: "há 4 min". */
export function formatarHaQuanto(
  instante: string | number | Date | null | undefined,
  agoraMs: number,
): string {
  const d = paraData(instante)
  if (!d) return TRACO
  return `há ${formatarIdade((agoraMs - d.getTime()) / 1000)}`
}

/**
 * ADAPTADOR ÚNICO da referência (baseline): a faixa normal aprendida por ponto, rotação e, no corte,
 * receita. Hoje a API não aprende referência; tudo devolve "indisponível" sem chamar rota. As telas
 * mostram SEM REFERÊNCIA e nenhuma cor de estado. Ligar a API futura será trocar este arquivo.
 */
import type { Referencia } from '@/dominio/estado'

export type ResultadoReferencia =
  { disponivel: false; motivo: string } | { disponivel: true; referencia: Referencia }

export type ConsultaDeReferencia = {
  pontoId: number
  metrica: string
  rotacaoRpm: number
}

/** A consulta já tem a forma da futura (ponto, métrica, rotação). */
export function obterReferencia(consulta: ConsultaDeReferencia): Promise<ResultadoReferencia> {
  return Promise.resolve({
    disponivel: false,
    motivo: `A API ainda não aprende a referência (faixa normal) de ${consulta.metrica} em cada ponto.`,
  })
}

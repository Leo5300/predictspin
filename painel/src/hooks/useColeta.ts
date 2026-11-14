import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { consultaCobertura, consultaEnsaioAberto } from '@/api/coleta'
import { consultaMaquina } from '@/api/consultas'
import {
  gradeDeCobertura,
  percentualDaCobertura,
  proximaSugerida,
  rotacoesDaConsulta,
  type ItemDeCobertura,
} from '@/dominio/coleta'
import { useMetaDaColeta } from '@/estado/coleta'

/** Máquina, plano, cobertura (grade válida), sugestão e ensaio aberto da Coleta. */
export function useColeta(maquinaId: number, simulado: boolean) {
  const meta = useMetaDaColeta()
  const maquina = useQuery(consultaMaquina(maquinaId))
  const planoDaApi = maquina.data?.rotacoes_coleta_rpm
  const plano = useMemo(() => planoDaApi ?? [], [planoDaApi])
  const rotacoes = rotacoesDaConsulta(plano)
  const cobertura = useQuery({
    ...consultaCobertura(maquinaId, simulado, meta, rotacoes),
    enabled: maquina.isSuccess,
  })
  const ensaioAberto = useQuery(consultaEnsaioAberto(maquinaId))
  const itens = cobertura.data?.itens
  const grade = useMemo(
    () => gradeDeCobertura((itens ?? []) as ItemDeCobertura[], plano, meta),
    [itens, plano, meta],
  )
  return {
    meta,
    maquina,
    plano,
    nominais: maquina.data?.rotacoes_nominais_rpm ?? [],
    cobertura,
    grade,
    sugerida: proximaSugerida(grade),
    percentual: percentualDaCobertura(grade),
    ensaioAberto,
  }
}

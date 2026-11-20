import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { chavesModelos } from '@/api/adaptadores/modelos'
import { assinarEventos } from '@/api/eventos'

import { usePaginaVisivel } from './usePaginaVisivel'

const ignorar = () => undefined

/**
 * Tela Modelos ao vivo: o evento "treino" refaz o trabalho (acordando, executando, concluído, falhou) e o
 * evento "modelo" refaz a lista de versões e o diagnóstico da IA.
 */
export function useModelosAoVivo(maquinaId: number | undefined, simulado: boolean) {
  const cliente = useQueryClient()
  const visivel = usePaginaVisivel()
  useEffect(() => {
    if (!visivel || maquinaId === undefined) return
    const refazer = () => {
      void cliente.invalidateQueries({ queryKey: chavesModelos.trabalhos(maquinaId, simulado) })
      void cliente.invalidateQueries({ queryKey: chavesModelos.modelos(maquinaId, simulado) })
      void cliente.invalidateQueries({ queryKey: chavesModelos.diagnostico(maquinaId, simulado) })
    }
    return assinarEventos({
      maquinaId,
      simulado,
      aoReceberJanela: ignorar,
      aoReceberEnsaio: ignorar,
      aoReceberModoRapido: ignorar,
      aoReceberTreino: refazer,
      aoReceberModelo: refazer,
      aoMudarEstado: ignorar,
    })
  }, [cliente, maquinaId, simulado, visivel])
}

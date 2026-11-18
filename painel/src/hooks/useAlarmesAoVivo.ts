import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { chavesAlarmes } from '@/api/adaptadores/alarmes'
import { chavesReferencia } from '@/api/adaptadores/referencia'
import { assinarEventos, type AlertaSse, type OrdemServicoSse } from '@/api/eventos'

import { usePaginaVisivel } from './usePaginaVisivel'

/** O que refazer quando um alerta ou uma OS muda (vale para qualquer tela que assine os eventos). */
export function reagirAoAlerta(cliente: QueryClient, evento: AlertaSse) {
  const { alerta } = evento
  void cliente.invalidateQueries({ queryKey: chavesAlarmes.alarmes(alerta.simulado) })
  void cliente.invalidateQueries({ queryKey: chavesAlarmes.alarme(alerta.id) })
  void cliente.invalidateQueries({
    queryKey: chavesReferencia.avaliacao(alerta.maquina_id, alerta.simulado),
  })
  void cliente.invalidateQueries({
    queryKey: chavesReferencia.diagnostico(alerta.maquina_id, alerta.simulado),
  })
}

export function reagirAOrdemServico(cliente: QueryClient, evento: OrdemServicoSse) {
  const { ordem } = evento
  void cliente.invalidateQueries({ queryKey: chavesAlarmes.ordens(ordem.simulado) })
  void cliente.invalidateQueries({
    queryKey: chavesReferencia.diagnostico(ordem.maquina_id, ordem.simulado),
  })
}

/** Eventos que esta assinatura não usa (janelas, ensaios, modo rápido). */
const ignorar = () => undefined

/**
 * Lista de alarmes e OS ao vivo: assina os eventos da máquina só para refazer as listas quando um
 * alerta ou uma OS muda. As telas da máquina e do ponto já fazem isso pelo useMaquinaAoVivo.
 */
export function useAlarmesAoVivo(maquinaId: number | undefined, simulado: boolean) {
  const cliente = useQueryClient()
  const visivel = usePaginaVisivel()
  useEffect(() => {
    if (!visivel || maquinaId === undefined) return
    return assinarEventos({
      maquinaId,
      simulado,
      aoReceberJanela: ignorar,
      aoReceberEnsaio: ignorar,
      aoReceberModoRapido: ignorar,
      aoReceberAlerta: (evento) => reagirAoAlerta(cliente, evento),
      aoReceberOrdemServico: (evento) => reagirAOrdemServico(cliente, evento),
      aoMudarEstado: ignorar,
    })
  }, [cliente, maquinaId, simulado, visivel])
}

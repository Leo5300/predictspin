import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import {
  INTERVALO_DE_CONSULTA_MS,
  chaves,
  consultaJanelasRecentes,
  consultaModoRapido,
  consultaUltimaJanela,
  registrarJanela,
  type UltimaObservada,
} from '@/api/consultas'
import { assinarEventos, type EstadoEventos } from '@/api/eventos'
import type { Janela, ModoRapido } from '@/api/tipos'
import { useFonte } from '@/estado/preferencias'
import { definirTransporte, definirUltimaObservacao } from '@/estado/transporte'

import { usePaginaVisivel } from './usePaginaVisivel'

export type MaquinaAoVivo = {
  simulado: boolean
  /** Última janela e quando o painel soube dela; nulo se nunca chegou janela desta fonte. */
  ultima: UltimaObservada | undefined
  carregando: boolean
  erro: unknown
  /** Janelas dos últimos 15 minutos, da mais antiga para a mais nova (inclui as rápidas ao vivo). */
  recentes: Janela[]
  modoRapido: ModoRapido | undefined
  /** Verdadeiro quando as janelas estão chegando por eventos; falso = consulta a cada 5 s. */
  porEventos: boolean
}

/**
 * Dados ao vivo de uma máquina para as telas da máquina e do ponto. Assim que a tela abre, assina
 * os eventos da API e passa a receber cada janela sem consultar. Se os eventos caem, volta à
 * consulta a cada 5 s até reconectar. Com a aba em segundo plano, não consome nada.
 */
export function useMaquinaAoVivo(maquinaId: number): MaquinaAoVivo {
  const simulado = useFonte() === 'simulado'
  const cliente = useQueryClient()
  const visivel = usePaginaVisivel()
  const [estadoEventos, setEstadoEventos] = useState<EstadoEventos>('conectando')
  const porEventos = estadoEventos === 'ao_vivo'
  const jaAssinou = useRef(false)

  const ultima = useQuery({
    ...consultaUltimaJanela(maquinaId, simulado),
    refetchInterval: porEventos ? false : INTERVALO_DE_CONSULTA_MS,
  })
  const recentes = useQuery(consultaJanelasRecentes(maquinaId, simulado))
  const modoRapido = useQuery({
    ...consultaModoRapido(maquinaId),
    refetchInterval: porEventos ? false : 15_000,
  })

  useEffect(() => {
    if (!visivel) return
    if (jaAssinou.current) {
      // voltou do segundo plano: o que chegou nesse meio-tempo é buscado de novo
      void cliente.invalidateQueries({ queryKey: chaves.janelasRecentes(maquinaId, simulado) })
      void cliente.invalidateQueries({ queryKey: chaves.ultimaJanela(maquinaId, simulado) })
    }
    jaAssinou.current = true
    return assinarEventos({
      maquinaId,
      simulado,
      aoReceberJanela: (janela) => {
        const observada: UltimaObservada = {
          janela,
          observacao: { idadeNaObservacaoS: 0, observadoEmMs: performance.now() },
        }
        cliente.setQueryData(chaves.ultimaJanela(maquinaId, simulado), () => observada)
        registrarJanela(cliente, maquinaId, simulado, janela)
      },
      aoReceberEnsaio: (evento) => {
        void cliente.invalidateQueries({ queryKey: chaves.ensaios(maquinaId, simulado) })
        // a Coleta acompanha: ensaio aberto, cobertura, lista e o próprio ensaio
        void cliente.invalidateQueries({ queryKey: ['ensaio-aberto', maquinaId] })
        void cliente.invalidateQueries({ queryKey: ['cobertura', maquinaId] })
        void cliente.invalidateQueries({ queryKey: ['ensaios-lista', maquinaId] })
        void cliente.invalidateQueries({ queryKey: ['ensaio', evento.ensaio.id] })
      },
      aoReceberEventoMarcado: (evento) => {
        void cliente.invalidateQueries({ queryKey: ['ensaio-eventos', evento.ensaio_id] })
      },
      aoReceberModoRapido: (estado) => {
        cliente.setQueryData(chaves.modoRapido(maquinaId), estado)
      },
      aoMudarEstado: setEstadoEventos,
    })
  }, [cliente, maquinaId, simulado, visivel])

  // Na consulta periódica, a janela nova também entra nas recentes
  const janelaConsultada = ultima.data?.janela
  useEffect(() => {
    if (janelaConsultada) registrarJanela(cliente, maquinaId, simulado, janelaConsultada)
  }, [cliente, janelaConsultada, maquinaId, simulado])

  useEffect(() => {
    definirTransporte(porEventos ? 'eventos' : 'consulta')
    return () => definirTransporte('inativo')
  }, [porEventos])

  const observacao = ultima.data?.observacao ?? null
  useEffect(() => {
    definirUltimaObservacao(observacao)
    return () => definirUltimaObservacao(null)
  }, [observacao])

  return {
    simulado,
    ultima: ultima.data,
    carregando: ultima.isPending,
    erro: ultima.error,
    recentes: recentes.data ?? [],
    modoRapido: modoRapido.data,
    porEventos,
  }
}

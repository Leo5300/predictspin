import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { URL_API } from '@/api/cliente'
import { chaves, desligarModoRapido, ligarModoRapido } from '@/api/consultas'
import { tokenAtual } from '@/api/sessao'
import type { ModoRapido } from '@/api/tipos'
import { desvioPeloPrazo, deveRenovar, segundosRestantes } from '@/dominio/modoRapido'
import { agoraDoServidorMs, registrarDesvioDoServidor, useSegundo } from '@/estado/relogio'
import { definirAoVivo } from '@/estado/transporte'

import { usePaginaVisivel } from './usePaginaVisivel'

export type ControleDoModoRapido = {
  /** A máquina está em modo rápido (pedido por este usuário ou por outro). */
  ativo: boolean
  restantesS: number
  ligar: () => void
  parar: () => void
  ocupado: boolean
  erro: unknown
}

/**
 * Botão AO VIVO: liga o modo rápido (janelas de 1 s por 2 minutos), renova antes do prazo enquanto
 * o gráfico estiver visível e desliga ao parar, ao sair da tela ou ao fechar a aba.
 *
 * @param graficoVisivel o gráfico ao vivo está na área visível da página
 */
export function useModoRapido(
  maquinaId: number,
  estado: ModoRapido | undefined,
  graficoVisivel: boolean,
): ControleDoModoRapido {
  const cliente = useQueryClient()
  const paginaVisivel = usePaginaVisivel()
  const { epocaMs } = useSegundo()
  // Verdadeiro quando foi este painel que pediu o modo rápido: só então ele renova e desliga ao sair
  const [pedido, setPedido] = useState(false)
  const pedidoAtual = useRef(false)

  const restantesS = segundosRestantes(estado?.modo_rapido_ate, agoraDoServidorMs(epocaMs))
  const ativo = estado?.ativo === true && restantesS > 0

  const ligar = useMutation({
    mutationFn: () => ligarModoRapido(maquinaId),
    onSuccess: (resposta) => {
      if (resposta.modo_rapido_ate) {
        registrarDesvioDoServidor(desvioPeloPrazo(resposta.modo_rapido_ate, Date.now()))
      }
      cliente.setQueryData(chaves.modoRapido(maquinaId), resposta)
      pedidoAtual.current = true
      setPedido(true)
    },
  })

  const desligar = useMutation({
    mutationFn: () => desligarModoRapido(maquinaId),
    onSuccess: (resposta) => {
      cliente.setQueryData(chaves.modoRapido(maquinaId), resposta)
    },
    onSettled: () => {
      pedidoAtual.current = false
      setPedido(false)
    },
  })

  // Renova antes do prazo, só enquanto o gráfico está visível
  const { mutate: renovar, isPending: renovando } = ligar
  const precisaRenovar =
    pedido && ativo && deveRenovar(restantesS) && paginaVisivel && graficoVisivel
  useEffect(() => {
    if (precisaRenovar && !renovando) renovar()
  }, [precisaRenovar, renovando, renovar])

  // Ao sair da tela ou fechar a aba, desliga o que este painel ligou
  useEffect(() => {
    /** Desliga se foi este painel que ligou; devolve se havia o que desligar. */
    const desligarAoSair = (): boolean => {
      if (!pedidoAtual.current) return false
      pedidoAtual.current = false
      const token = tokenAtual()
      if (!token) return false
      void fetch(`${URL_API}/api/v1/maquinas/${maquinaId}/modo-rapido`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => undefined)
      return true
    }
    const aoFechar = () => {
      desligarAoSair()
    }
    window.addEventListener('pagehide', aoFechar)
    return () => {
      window.removeEventListener('pagehide', aoFechar)
      if (desligarAoSair()) {
        cliente.setQueryData<ModoRapido>(chaves.modoRapido(maquinaId), (anterior) =>
          anterior ? { ...anterior, ativo: false, modo_rapido_ate: null } : anterior,
        )
      }
    }
  }, [cliente, maquinaId])

  useEffect(() => {
    definirAoVivo(ativo)
    return () => definirAoVivo(false)
  }, [ativo])

  const { mutate: pedirLigar } = ligar
  const { mutate: pedirDesligar } = desligar
  return {
    ativo,
    restantesS,
    ligar: useCallback(() => pedirLigar(), [pedirLigar]),
    parar: useCallback(() => pedirDesligar(), [pedirDesligar]),
    ocupado: ligar.isPending || desligar.isPending,
    erro: ligar.error ?? desligar.error,
  }
}

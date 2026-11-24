import { router } from 'expo-router'
import { useEffect } from 'react'
import { AppState } from 'react-native'

import { atualizarRegistro, esquecerPush, obterEstadoDoPush, ouvirToques } from '@/api/push'
import type { DestinoDaNotificacao } from '@/dominio/notificacao'
import { definirFonte } from '@/estado/preferencias'

/**
 * Abre o que a notificação aponta: o detalhe do alarme ou da OS. A fonte dos dados passa a ser a do
 * push (real ou simulado), para a tela mostrar o mesmo mundo da notificação.
 */
export function abrirDestino(destino: DestinoDaNotificacao) {
  definirFonte(destino.simulado ? 'simulado' : 'real')
  if (destino.tela === 'alarme') {
    router.push({ pathname: '/alarmes/[alertaId]', params: { alertaId: String(destino.alertaId) } })
  } else {
    router.push({ pathname: '/ordens/[osId]', params: { osId: String(destino.osId) } })
  }
}

/**
 * Nas abas, com a sessão aberta: registra este celular para push, confere a permissão de novo quando o
 * app volta para a frente (a pessoa pode ter ligado nas configurações) e abre o alarme ou a OS da
 * notificação tocada, inclusive a que abriu o app com a sessão travada.
 */
export function useNotificacoes(usuarioId: number | undefined) {
  useEffect(() => {
    if (usuarioId === undefined) return
    void atualizarRegistro()
    const assinatura = AppState.addEventListener('change', (situacao) => {
      if (situacao === 'active' && obterEstadoDoPush().fase === 'desligado') void atualizarRegistro()
    })
    return () => {
      assinatura.remove()
      esquecerPush()
    }
  }, [usuarioId])

  useEffect(() => ouvirToques(abrirDestino), [])
}

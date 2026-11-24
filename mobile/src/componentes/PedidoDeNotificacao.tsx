import { useState } from 'react'
import { View } from 'react-native'

import { adiarPedido, pedirPermissao, useEstadoDoPush } from '@/api/push'
import { Botao } from '@/componentes/Basicos'
import { Texto } from '@/componentes/Texto'
import { oQueChegaPorPush } from '@/dominio/notificacao'
import type { Papel } from '@/dominio/permissoes'

/**
 * Pedido de notificação, uma vez, depois do primeiro login: uma frase dizendo para quê, e só então a
 * janela do sistema. "Agora não" não volta a perguntar; a Conta continua oferecendo ligar.
 */
export function PedidoDeNotificacao({ papel }: { papel: Papel }) {
  const estado = useEstadoDoPush()
  const [ocupado, setOcupado] = useState(false)
  if (estado.fase !== 'desligado' || !estado.oferecer) return null

  return (
    <View className="border-b border-linha-forte bg-modulo px-4 pt-3 pb-4" testID="pedido-de-notificacao">
      <Texto peso="forte" accessibilityRole="header">
        Avisar neste celular quando houver alarme?
      </Texto>
      <Texto tamanho="13" tom="apoio" className="mt-1">
        Só o que pede ação: {oQueChegaPorPush(papel)}. Nunca a cada janela.
      </Texto>
      <View className="mt-3 flex-row gap-3">
        <View className="flex-1">
          <Botao titulo="Agora não" onPress={() => void adiarPedido()} testID="pedido-agora-nao" />
        </View>
        <View className="flex-1">
          <Botao
            variante="acao"
            titulo="Permitir"
            carregando={ocupado}
            dica="Abre o pedido de permissão do sistema"
            onPress={() => {
              setOcupado(true)
              void pedirPermissao().finally(() => setOcupado(false))
            }}
            testID="pedido-permitir"
          />
        </View>
      </View>
    </View>
  )
}

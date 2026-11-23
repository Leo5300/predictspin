import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { aparenciaDoAlarme, type AlarmeBasico } from '@/dominio/alarme'
import { useCores } from '@/hooks/basicos'

import { corDoTom, Forma } from './Forma'

/**
 * Ícone do alarme: losango (alarme), triângulo (atenção) ou quadrado (instrumento); vazado quando
 * voltou ao normal ou encerrou; riscado quando suprimido. Ativo não reconhecido: só o ícone pisca
 * devagar; com "reduzir movimento", um anel parado em volta ocupa o lugar do piscar.
 */
export function IconeDoAlarme({ alarme }: { alarme: Pick<AlarmeBasico, 'estado' | 'nivel' | 'tipo'> }) {
  const aparencia = aparenciaDoAlarme(alarme)
  const reduzir = useReducedMotion()
  const cores = useCores()
  const opacidade = useSharedValue(1)
  const pisca = aparencia.pisca && !reduzir

  useEffect(() => {
    if (pisca) {
      opacidade.set(
        withRepeat(
          withSequence(
            withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
        ),
      )
    } else {
      cancelAnimation(opacidade)
      opacidade.set(1)
    }
  }, [pisca, opacidade])

  const estilo = useAnimatedStyle(() => ({ opacity: opacidade.value }))
  return (
    <View className="h-8 w-8 items-center justify-center" testID="icone-alarme">
      {aparencia.pisca && reduzir ? (
        <View
          className="absolute h-8 w-8 border-2"
          style={{ borderRadius: 16, borderColor: corDoTom(aparencia.tom, cores).contorno }}
          testID="anel-parado"
        />
      ) : null}
      <Animated.View style={estilo}>
        <Forma
          forma={aparencia.forma}
          tom={aparencia.tom}
          tamanho={18}
          vazada={aparencia.vazado}
          riscada={aparencia.riscado}
        />
      </Animated.View>
    </View>
  )
}

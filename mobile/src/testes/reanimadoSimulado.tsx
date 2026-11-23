/**
 * Simulação do Reanimated para os testes. O mock oficial do react-native-reanimated 4.7.1 lança erro
 * ao carregar no jest-expo ("setCSSEventHandler is not available in JSReanimated"); esta cobre só o
 * que o app usa. Animação não é testada aqui: valores vão direto ao fim.
 */
import type { ComponentType } from 'react'
import { View } from 'react-native'

type Valor<T> = { value: T; get: () => T; set: (v: T) => void }

function valor<T>(inicial: T): Valor<T> {
  const v = {
    value: inicial,
    get: () => v.value,
    set: (novo: T) => {
      v.value = novo
    },
  }
  return v
}

const animacao = <T,>(fim: T) => fim
const entrada = () => {
  const cadeia: Record<string, unknown> = {}
  cadeia.duration = () => cadeia
  cadeia.reduceMotion = () => cadeia
  cadeia.delay = () => cadeia
  return cadeia
}

/** No React 19 a ref é uma prop comum: o componente animado é o próprio componente. */
function createAnimatedComponent<P extends object>(Componente: ComponentType<P>) {
  return Componente
}

const Animated = { View, createAnimatedComponent }

const curva = () => curva
const Easing = { linear: curva, quad: curva, in: curva, out: curva, inOut: curva, bezier: curva }

module.exports = {
  __esModule: true,
  default: Animated,
  createAnimatedComponent,
  useSharedValue: valor,
  useAnimatedStyle: (fn: () => object) => fn(),
  withTiming: animacao,
  withSpring: animacao,
  withRepeat: animacao,
  withSequence: (...passos: unknown[]) => passos[passos.length - 1],
  cancelAnimation: () => undefined,
  useReducedMotion: () => false,
  Easing,
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
  FadeInUp: entrada(),
  FadeOutUp: entrada(),
}

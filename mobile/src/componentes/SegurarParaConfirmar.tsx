import * as Haptics from 'expo-haptics'
import { useEffect, useRef } from 'react'
import { Pressable, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { useCores } from '@/hooks/basicos'

import { ALVO_DE_TOQUE } from './Basicos'
import { Texto } from './Texto'

/** Tempo segurando para confirmar. */
export const DURACAO_SEGURAR_MS = 1500
const VOLTA_MS = 200
const TIQUES = 24
const INTERVALO_HAPTICS_MS = 250

function vibrar(tipo: 'selecao' | 'sucesso') {
  const promessa =
    tipo === 'selecao'
      ? Haptics.selectionAsync()
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  void promessa.catch(() => undefined)
}

/** Um tique do anel: acende quando o progresso passa da posição dele. */
function Tique({ indice, progresso, cor }: { indice: number; progresso: SharedValue<number>; cor: string }) {
  const limiar = (indice + 1) / TIQUES
  const estilo = useAnimatedStyle(() => ({ opacity: progresso.value >= limiar ? 1 : 0.18 }))
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 13,
          top: 1,
          width: 2,
          height: 6,
          backgroundColor: cor,
          transformOrigin: '1px 13px',
          transform: [{ rotate: `${(indice * 360) / TIQUES}deg` }],
        },
        estilo,
      ]}
    />
  )
}

/**
 * Segurar para confirmar (ato deliberado, ISA-18.2). O anel de tiques enche em 1,5 s, linear, com
 * tiques de haptics de seleção; ao completar, haptics de sucesso e a ação; ao soltar antes, o anel
 * volta em 200 ms e nada acontece. Haptics nunca é o único retorno: o anel e o texto também dizem.
 * O fim é contado por um temporizador comum (não pelo fim da animação), e nada muda o estado do
 * React durante o gesto. Leitor de tela: a ação "segurar" (toque duplo e segure) confirma.
 */
export function SegurarParaConfirmar({
  titulo,
  aoConfirmar,
  desabilitado = false,
  motivoDesabilitado,
  testID,
}: {
  titulo: string
  aoConfirmar: () => void
  desabilitado?: boolean
  /** Por que está desabilitado (sem conexão, por exemplo), dito ao leitor de tela. */
  motivoDesabilitado?: string
  testID?: string
}) {
  const cores = useCores()
  const progresso = useSharedValue(0)
  const fim = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tiques = useRef<ReturnType<typeof setInterval> | null>(null)
  const confirmar = useRef(aoConfirmar)
  useEffect(() => {
    confirmar.current = aoConfirmar
  }, [aoConfirmar])

  const limpar = () => {
    if (fim.current) clearTimeout(fim.current)
    if (tiques.current) clearInterval(tiques.current)
    fim.current = null
    tiques.current = null
  }
  useEffect(() => limpar, [])

  const comecar = () => {
    if (desabilitado) return
    limpar()
    progresso.set(withTiming(1, {
      duration: DURACAO_SEGURAR_MS,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    }),
    )
    vibrar('selecao')
    tiques.current = setInterval(() => vibrar('selecao'), INTERVALO_HAPTICS_MS)
    fim.current = setTimeout(() => {
      limpar()
      vibrar('sucesso')
      progresso.set(withTiming(0, { duration: VOLTA_MS }))
      confirmar.current()
    }, DURACAO_SEGURAR_MS)
  }

  const soltar = () => {
    if (!fim.current) return
    limpar()
    progresso.set(withTiming(0, { duration: VOLTA_MS, easing: Easing.out(Easing.quad) }))
  }

  const corDoAnel = desabilitado ? cores.fraco : cores.texto
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityHint={
        desabilitado
          ? motivoDesabilitado
          : 'Toque duas vezes e segure até completar o anel para confirmar.'
      }
      accessibilityState={{ disabled: desabilitado }}
      accessibilityActions={[{ name: 'longpress', label: titulo }]}
      onAccessibilityAction={(evento) => {
        if (evento.nativeEvent.actionName === 'longpress' && !desabilitado) {
          vibrar('sucesso')
          confirmar.current()
        }
      }}
      disabled={desabilitado}
      onPressIn={comecar}
      onPressOut={soltar}
      testID={testID}
      className={`flex-row items-center gap-3 border px-4 ${desabilitado ? 'border-linha-forte bg-rebaixo' : 'border-linha-forte bg-modulo'}`}
      style={[{ minHeight: ALVO_DE_TOQUE, borderRadius: 2 }, desabilitado ? { borderStyle: 'dashed' } : null]}
    >
      <View style={{ width: 28, height: 28 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: TIQUES }, (_, i) => (
          <Tique key={i} indice={i} progresso={progresso} cor={corDoAnel} />
        ))}
      </View>
      <Texto peso="forte" tom={desabilitado ? 'fraco' : 'texto'} numberOfLines={2} className="flex-1">
        {titulo}
      </Texto>
    </Pressable>
  )
}

import { useId } from 'react'
import { View } from 'react-native'
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg'

import { useCores } from '@/hooks/basicos'

import { Texto } from './Texto'

/** Hachura diagonal de dado simulado, ocupando o espaço do pai. */
export function Hachura() {
  const cores = useCores()
  const id = `h${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <Svg
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      width="100%"
      height="100%"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={7} stroke={cores.simulado} strokeWidth={3} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  )
}

/** Selo "SIM": dado simulado, impossível confundir com medição num print. */
export function SeloSim() {
  return (
    <View
      className="h-6 justify-center overflow-hidden border border-linha-forte px-1.5"
      accessible
      accessibilityLabel="Dado simulado"
    >
      <Hachura />
      <Texto tamanho="12" familia="mono" peso="forte" style={{ letterSpacing: 1 }}>
        SIM
      </Texto>
    </View>
  )
}

/** Faixa hachurada no topo enquanto a fonte é Simulado. */
export function FaixaSimulado() {
  return (
    <View
      className="h-7 flex-row items-center justify-center overflow-hidden border-b border-linha-forte bg-rebaixo"
      accessible
      accessibilityLabel="Mostrando dado simulado, não é medição"
      testID="faixa-simulado"
    >
      <Hachura />
      <View className="bg-rebaixo px-2">
        <Texto rotulo tom="texto">
          dado simulado · não é medição
        </Texto>
      </View>
    </View>
  )
}

import Svg, { Path } from 'react-native-svg'

import type { Forma as NomeDaForma, Tom } from '@/dominio/estado'
import { useCores } from '@/hooks/basicos'
import type { Cores } from '@/tema/tokens'

/** Caminhos num quadro de 24 × 24 (os mesmos do painel). */
const CAMINHO: Record<NomeDaForma, string> = {
  circulo: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Z',
  triangulo: 'M12 2.5 22.5 21h-21Z',
  losango: 'M12 1.5 22.5 12 12 22.5 1.5 12Z',
  quadrado: 'M3.5 3.5h17v17h-17Z',
  anel: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm0 3.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 0 1 0-11Z',
}

/** Cor de preenchimento e de contorno de cada tom. */
export function corDoTom(tom: Tom, cores: Cores): { preenchimento: string; contorno: string } {
  switch (tom) {
    case 'alarme':
      return { preenchimento: cores.alarme, contorno: cores.alarme }
    case 'atencao':
      // no claro o âmbar some contra o fundo: o contorno no tom de texto mantém a forma acima de 3:1
      return { preenchimento: cores.atencao, contorno: cores.atencaoTexto }
    case 'info':
      return { preenchimento: cores.info, contorno: cores.info }
    case 'apagado':
      return { preenchimento: cores.fraco, contorno: cores.fraco }
    default:
      return { preenchimento: cores.normal, contorno: cores.normal }
  }
}

/** Forma numa cor fixa, para desenhar sobre o fundo âmbar ou vermelho de um selo. */
export function FormaComCor({
  forma,
  cor,
  tamanho = 13,
}: {
  forma: NomeDaForma
  cor: string
  tamanho?: number
}) {
  return (
    <Svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={CAMINHO[forma]} fill={cor} fillRule={forma === 'anel' ? 'evenodd' : 'nonzero'} />
    </Svg>
  )
}

/** Forma do estado (codificação redundante: forma + cor + texto). Decorativa para o leitor de tela. */
export function Forma({
  forma,
  tom,
  tamanho = 14,
  vazada = false,
  riscada = false,
}: {
  forma: NomeDaForma
  tom: Tom
  tamanho?: number
  vazada?: boolean
  riscada?: boolean
}) {
  const cores = useCores()
  const { preenchimento, contorno } = corDoTom(tom, cores)
  const anel = forma === 'anel'
  return (
    <Svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        d={CAMINHO[forma]}
        fill={vazada ? 'none' : preenchimento}
        fillRule={anel ? 'evenodd' : 'nonzero'}
        stroke={contorno}
        strokeWidth={vazada ? 2.5 : 1.5}
        strokeLinejoin="round"
      />
      {riscada ? <Path d="M3 21 21 3" stroke={cores.texto} strokeWidth={2} /> : null}
    </Svg>
  )
}

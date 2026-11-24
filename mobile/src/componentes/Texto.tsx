import { Text, type TextProps } from 'react-native'

/**
 * Texto do app. Variações por propriedade (não por classe solta) para o resultado não depender da
 * ordem das classes. Plex Sans na interface, Plex Mono só em valores, letras de ponto e códigos,
 * Doto (matriz de pontos) só na placa de estado, na rotação e no cronômetro da coleta. Respeita a fonte do sistema até 130%.
 */

export type Tamanho = '12' | '13' | '15' | '18' | '24' | '32' | '40' | '72'
export type TomDoTexto =
  | 'texto'
  | 'apoio'
  | 'fraco'
  | 'acao'
  | 'atencao'
  | 'alarme'
  | 'info'
  | 'sobreAtencao'
  | 'sobreAlarme'

const TAMANHO: Record<Tamanho, string> = {
  '12': 'text-12',
  '13': 'text-13',
  '15': 'text-15',
  '18': 'text-18',
  '24': 'text-24',
  '32': 'text-32',
  '40': 'text-40',
  '72': 'text-72',
}

const TOM: Record<TomDoTexto, string> = {
  texto: 'text-texto',
  apoio: 'text-apoio',
  fraco: 'text-fraco',
  acao: 'text-acao-texto',
  atencao: 'text-atencao-texto',
  alarme: 'text-alarme-texto',
  info: 'text-info',
  sobreAtencao: 'text-atencao-sobre',
  sobreAlarme: 'text-alarme-sobre',
}

const FAMILIA = {
  sans: { normal: 'font-sans', medio: 'font-sans-medio', forte: 'font-sans-forte' },
  mono: { normal: 'font-mono', medio: 'font-mono-medio', forte: 'font-mono-forte' },
  matriz: { normal: 'font-matriz', medio: 'font-matriz', forte: 'font-matriz' },
} as const

export type PropsDoTexto = TextProps & {
  tamanho?: Tamanho
  tom?: TomDoTexto
  familia?: keyof typeof FAMILIA
  peso?: 'normal' | 'medio' | 'forte'
  /** Rótulo curto de instrumento: caixa-alta pequena com espaçamento (RMS, PICO, RPM). */
  rotulo?: boolean
  className?: string
}

export function Texto({
  tamanho = '15',
  tom = 'texto',
  familia = 'sans',
  peso = 'normal',
  rotulo = false,
  className = '',
  style,
  ...resto
}: PropsDoTexto) {
  const classes = [
    FAMILIA[familia][rotulo ? 'medio' : peso],
    TAMANHO[rotulo ? '12' : tamanho],
    TOM[rotulo && tom === 'texto' ? 'apoio' : tom],
    className,
  ].join(' ')
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      className={classes}
      style={[
        rotulo ? { letterSpacing: 1, textTransform: 'uppercase' } : null,
        familia === 'mono' ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...resto}
    />
  )
}

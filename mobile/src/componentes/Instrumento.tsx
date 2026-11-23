import { View } from 'react-native'
import Svg, { Line, Path } from 'react-native-svg'

import type { EstadoMaquina, Limites } from '@/dominio/estado'
import { FORMA_ESTADO_MAQUINA, ROTULO_ESTADO_MAQUINA, regua } from '@/dominio/estado'
import { formatarRpm, formatarZ } from '@/dominio/formato'
import { caminhosDaSparkline, corDoPonto, estiloDoPonto, TRACO_DO_ESTILO } from '@/dominio/pontos'
import { useCores } from '@/hooks/basicos'

import { Forma } from './Forma'
import { Texto } from './Texto'

/** Letra do ponto (Plex Mono, no tom do ponto) e a amostra do estilo de linha dele. */
export function AmostraDoPonto({ codigo, apagado = false }: { codigo: string; apagado?: boolean }) {
  const cores = useCores()
  const cor = apagado ? cores.fraco : cores[corDoPonto(codigo)]
  return (
    <View
      className="w-12 items-center gap-1"
      accessible
      accessibilityLabel={`Ponto ${codigo}`}
    >
      <Texto familia="mono" peso="forte" tamanho="24" style={{ color: cor }}>
        {codigo}
      </Texto>
      <Svg width={28} height={4} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Line
          x1={1}
          y1={2}
          x2={27}
          y2={2}
          stroke={cor}
          strokeWidth={2}
          strokeDasharray={TRACO_DO_ESTILO[estiloDoPonto(codigo)]}
          strokeLinecap="butt"
        />
      </Svg>
    </View>
  )
}

/**
 * Placa de estado da máquina em matriz de pontos: OPERANDO, PARADO ou SEM DADOS. Nenhum dos três é
 * desvio: a placa é neutra; o texto e a forma distinguem; SEM DADOS fica fraco e tracejado.
 */
export function PlacaEstado({ estado }: { estado: EstadoMaquina }) {
  const semDados = estado === 'sem_dados'
  return (
    <View
      className="min-h-14 flex-row items-center gap-2 self-start border bg-rebaixo px-3"
      style={semDados ? { borderStyle: 'dashed' } : null}
      accessible
      accessibilityLabel={`Estado da máquina: ${ROTULO_ESTADO_MAQUINA[estado].toLowerCase()}`}
      testID={`placa-${estado}`}
    >
      <Forma forma={FORMA_ESTADO_MAQUINA[estado]} tom={semDados ? 'apagado' : 'neutro'} tamanho={16} />
      <Texto familia="matriz" tamanho="24" tom={semDados ? 'fraco' : 'texto'}>
        {ROTULO_ESTADO_MAQUINA[estado]}
      </Texto>
    </View>
  )
}

/**
 * Rotação: número em matriz de pontos quando o dado é vivo; com dado velho, Plex Mono em cinza claro
 * (o mostrador "aceso" é a convenção do vivo).
 */
export function Rotacao({
  rpm,
  vivo,
  marcha,
}: {
  rpm: number | null | undefined
  vivo: boolean
  marcha: number | null
}) {
  const valor = formatarRpm(rpm)
  return (
    <View
      className="items-end"
      accessible
      accessibilityLabel={`Rotação ${valor} rpm${marcha !== null ? `, marcha ${marcha}` : ''}${vivo ? '' : ', dado velho'}`}
    >
      <View className="flex-row items-baseline gap-1.5">
        <Texto familia={vivo ? 'matriz' : 'mono'} tamanho="40" tom={vivo ? 'texto' : 'fraco'} testID="rotacao">
          {valor}
        </Texto>
        <Texto rotulo>RPM</Texto>
      </View>
      {marcha !== null ? (
        <Texto tamanho="12" tom="apoio">
          marcha <Texto tamanho="12" familia="mono" tom="apoio">{String(marcha)}</Texto>
        </Texto>
      ) : null}
    </View>
  )
}

/**
 * Régua de desvio em z: o centro é o típico (referência), a faixa é a tolerância, as marcas são os
 * limites de atenção e de alarme da API; o ponteiro fica cinza dentro, âmbar perto e vermelho além.
 * Os números de ponteiro e limites vêm da API; o app só posiciona.
 */
export function ReguaDesvio({
  z,
  limites,
  apagado = false,
}: {
  z: number | null
  limites: Limites | null
  apagado?: boolean
}) {
  const cores = useCores()
  if (!limites) {
    return (
      <View
        className="h-3 justify-center border border-linha-forte bg-rebaixo"
        style={{ borderStyle: 'dashed' }}
        accessible
        accessibilityLabel="Régua de desvio: sem comparação com a referência"
      />
    )
  }
  const r = regua(z, limites)
  const corDoPonteiro = apagado
    ? cores.fraco
    : r.tom === 'alarme'
      ? cores.alarme
      : r.tom === 'atencao'
        ? cores.atencaoTexto
        : cores.texto
  const pct = (v: number) => `${(v * 100).toFixed(2)}%` as const
  const descricao =
    z === null
      ? 'Régua de desvio: sem z nesta janela'
      : `Régua de desvio: z ${formatarZ(z)}; atenção a partir de ${formatarZ(limites.z_atencao)}, alarme a partir de ${formatarZ(limites.z_alarme)}`
  return (
    <View accessible accessibilityLabel={descricao} testID="regua">
      <View className="h-3 border border-linha-forte bg-rebaixo">
        <View
          className="absolute top-0 bottom-0 bg-realce"
          style={{ left: pct(r.toleranciaInicio), width: pct(r.toleranciaFim - r.toleranciaInicio) }}
        />
        <View className="absolute -top-px -bottom-px w-px bg-linha-forte" style={{ left: '50%' }} />
        <View className="absolute top-0 bottom-0 w-0.5" style={{ left: pct(r.marcaAtencao), backgroundColor: cores.atencaoTexto }} />
        <View className="absolute top-0 bottom-0 w-0.5" style={{ left: pct(r.marcaAlarme), backgroundColor: cores.alarme }} />
        {r.ponteiro !== null ? (
          <View
            className="absolute -top-1 -bottom-1 w-1"
            style={{ left: pct(r.ponteiro), marginLeft: -2, backgroundColor: corDoPonteiro }}
          />
        ) : null}
      </View>
      <View className="mt-0.5 flex-row justify-between">
        <Texto tamanho="12" tom="fraco">abaixo</Texto>
        <Texto tamanho="12" tom="fraco">típico</Texto>
        <Texto tamanho="12" tom="fraco">acima</Texto>
      </View>
    </View>
  )
}

/**
 * Sparkline sem eixos dos últimos minutos. Linha interrompida = intervalo sem janela. Sempre
 * contínua (o estilo do ponto fica na amostra ao lado da letra: tracejado se confundia com lacuna).
 */
export function Sparkline({
  valores,
  codigo,
  apagado = false,
}: {
  valores: readonly (number | null)[]
  codigo: string
  apagado?: boolean
}) {
  const cores = useCores()
  const caminhos = caminhosDaSparkline(valores, 100, 28)
  const cor = apagado ? cores.fraco : cores[corDoPonto(codigo)]
  return (
    <View
      className="h-7"
      accessible
      accessibilityLabel={
        caminhos.length === 0
          ? `Tendência do ponto ${codigo}: sem janelas nos últimos minutos`
          : `Tendência do RMS do ponto ${codigo} nos últimos minutos`
      }
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 28" preserveAspectRatio="none">
        {caminhos.map((d, i) => (
          <Path key={i} d={d} stroke={cor} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
        ))}
      </Svg>
    </View>
  )
}

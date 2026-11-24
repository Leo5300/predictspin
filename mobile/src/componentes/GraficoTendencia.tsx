import { useState } from 'react'
import { View, type AccessibilityActionEvent, type GestureResponderEvent } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'

import { formatarG, formatarHora, formatarHoraMinuto, formatarNumero, formatarZ } from '@/dominio/formato'
import {
  amostraMaisProxima,
  limitesDoEixo,
  marcasDeTempo,
  resumoDaTendencia,
  trechos,
  type FaixaNormal,
  type Tendencia,
} from '@/dominio/tendencia'
import { useCores } from '@/hooks/basicos'

import { Texto } from './Texto'

const MARGEM = { esquerda: 44, direita: 10, topo: 8, base: 22 }
const LARGURA_DA_MARCA_DE_TEMPO = 56
const MARCA = 4

/** Casas decimais do eixo pelo teto: 0,03 g pede três; 2 g pede uma. */
function casasDoEixo(teto: number): number {
  if (teto < 0.1) return 3
  if (teto < 1) return 2
  return 1
}

type Props = {
  tendencia: Tendencia
  inicioS: number
  fimS: number
  /** Faixa normal e limites na unidade da medida; sem referência, nada é desenhado. */
  faixa: FaixaNormal | null
  /** Limites em z da API, para marcar os instantes em desvio. */
  limitesZ: { z_atencao: number; z_alarme: number } | null
  /** Começo da frase do leitor de tela ("Tendência do RMS do ponto B, últimos 15 min"). */
  descricao: string
  altura?: number
  testID?: string
}

/**
 * Tendência do RMS de um ponto em SVG. A linha é contínua e neutra; buraco de dado é buraco (a linha
 * quebra, nunca liga por cima). Faixa normal sombreada, limites de atenção e alarme em linhas finas
 * tracejadas. Cor só no desvio: ▲ âmbar em atenção, ◆ vermelho em alarme, pelo z da própria API.
 * Arrastar na horizontal mostra o valor e a hora; o arrasto vertical continua rolando a tela. No leitor
 * de tela, deslizar para cima e para baixo anda pelas amostras.
 */
export function GraficoTendencia({
  tendencia,
  inicioS,
  fimS,
  faixa,
  limitesZ,
  descricao,
  altura = 180,
  testID,
}: Props) {
  const cores = useCores()
  const [largura, setLargura] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const amostras = tendencia.amostras
  const valores = amostras.map((a) => a.valor)
  const [, teto] = limitesDoEixo([...valores, faixa?.alarme])
  const casas = casasDoEixo(teto)
  // leitura com a resolução do resto do app; o eixo usa só as casas que o teto pede
  const g = (v: number) => `${formatarG(v)} g`

  const larguraUtil = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita)
  const alturaUtil = altura - MARGEM.topo - MARGEM.base
  const x = (t: number) => MARGEM.esquerda + ((t - inicioS) / (fimS - inicioS || 1)) * larguraUtil
  const y = (v: number) => MARGEM.topo + (1 - Math.min(v, teto) / teto) * alturaUtil
  const tempoDoX = (px: number) => inicioS + ((px - MARGEM.esquerda) / (larguraUtil || 1)) * (fimS - inicioS)

  const desvio = (z: number | null): 'atencao' | 'alarme' | null => {
    if (!limitesZ || z === null) return null
    if (z >= limitesZ.z_alarme) return 'alarme'
    return z >= limitesZ.z_atencao ? 'atencao' : null
  }

  const resumo = resumoDaTendencia(tendencia, limitesZ, g)
  const semDados = !valores.some((v) => v !== null)
  const escolhida = cursor === null ? null : amostras[cursor]
  const ultima = [...amostras].reverse().find((a) => a.valor !== null)
  const leitura = (a: { t: number; valor: number | null; z: number | null }) =>
    `${formatarHora(a.t * 1000)} · ${a.valor === null ? '—' : g(a.valor)}${a.z === null ? '' : ` · z ${formatarZ(a.z)}`}`
  const textoDaLeitura = escolhida
    ? leitura(escolhida)
    : ultima
      ? `último ${leitura(ultima)}`
      : 'sem janelas no período'

  const mover = (evento: GestureResponderEvent) => {
    setCursor(amostraMaisProxima(amostras, tempoDoX(evento.nativeEvent.locationX)))
  }

  const andar = (passo: 1 | -1) => {
    const comValor = amostras.flatMap((a, i) => (a.valor === null ? [] : [i]))
    if (comValor.length === 0) return
    const atual = cursor === null ? -1 : comValor.indexOf(cursor)
    const proximo = atual === -1 ? (passo === 1 ? 0 : comValor.length - 1) : atual + passo
    setCursor(comValor[Math.min(comValor.length - 1, Math.max(0, proximo))] ?? null)
  }

  const deslocamentoS = -new Date().getTimezoneOffset() * 60
  const marcas = largura
    ? marcasDeTempo(inicioS, fimS, Math.max(2, Math.floor(larguraUtil / LARGURA_DA_MARCA_DE_TEMPO)), deslocamentoS)
    : []

  return (
    <View testID={testID}>
      <Texto tamanho="13" familia="mono" tom="apoio" className="mb-1" testID="leitura-tendencia">
        {textoDaLeitura}
      </Texto>
      <View
        style={{ height: altura }}
        onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
        testID="caixa-do-grafico"
      >
        {largura > 0 ? (
          <Svg width={largura} height={altura} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <Line
                key={f}
                x1={MARGEM.esquerda}
                x2={MARGEM.esquerda + larguraUtil}
                y1={y(teto * f)}
                y2={y(teto * f)}
                stroke={f === 0 ? cores.linhaForte : cores.reticulaFina}
                strokeWidth={1}
              />
            ))}
            {faixa ? (
              <>
                <Rect
                  x={MARGEM.esquerda}
                  width={larguraUtil}
                  y={y(faixa.atencao)}
                  height={Math.max(0, y(faixa.inferior) - y(faixa.atencao))}
                  fill={cores.reticula}
                  testID="faixa-normal"
                />
                {(['atencao', 'alarme'] as const).map((limite) =>
                  faixa[limite] <= teto ? (
                    <Line
                      key={limite}
                      x1={MARGEM.esquerda}
                      x2={MARGEM.esquerda + larguraUtil}
                      y1={y(faixa[limite])}
                      y2={y(faixa[limite])}
                      stroke={cores[limite]}
                      strokeWidth={1}
                      strokeDasharray="6 4"
                      testID={`limite-${limite}`}
                    />
                  ) : null,
                )}
              </>
            ) : null}
            {trechos(amostras).map((trecho, i) =>
              trecho.length === 1 ? (
                // amostra sem vizinhas: vira ponto, senão sumiria entre dois buracos
                <Circle key={i} cx={x(trecho[0]!.t)} cy={y(trecho[0]!.valor!)} r={1.8} fill={cores.texto} />
              ) : (
                <Path
                  key={i}
                  d={trecho.map((a, k) => `${k === 0 ? 'M' : 'L'}${x(a.t).toFixed(1)},${y(a.valor!).toFixed(1)}`).join('')}
                  stroke={cores.texto}
                  strokeWidth={1.5}
                  fill="none"
                  testID="trecho-tendencia"
                />
              ),
            )}
            {amostras.map((a, i) => {
              const d = a.valor === null ? null : desvio(a.z)
              if (!d || a.valor === null) return null
              const cx = x(a.t)
              const cy = y(a.valor)
              return d === 'alarme' ? (
                <Path
                  key={`d${i}`}
                  d={`M${cx},${cy - MARCA}L${cx + MARCA},${cy}L${cx},${cy + MARCA}L${cx - MARCA},${cy}Z`}
                  fill={cores.alarme}
                  testID="marca-alarme"
                />
              ) : (
                <Path
                  key={`d${i}`}
                  d={`M${cx},${cy - MARCA}L${cx + MARCA},${cy + MARCA - 1}L${cx - MARCA},${cy + MARCA - 1}Z`}
                  fill={cores.atencao}
                  testID="marca-atencao"
                />
              )
            })}
            {escolhida && escolhida.valor !== null ? (
              <>
                <Line
                  x1={x(escolhida.t)}
                  x2={x(escolhida.t)}
                  y1={MARGEM.topo}
                  y2={MARGEM.topo + alturaUtil}
                  stroke={cores.linhaForte}
                  strokeWidth={1}
                />
                <Circle cx={x(escolhida.t)} cy={y(escolhida.valor)} r={3.5} fill={cores.texto} />
              </>
            ) : null}
          </Svg>
        ) : null}
        {largura > 0
          ? [teto, teto / 2, 0].map((v) => (
              <Texto
                key={v}
                tamanho="12"
                familia="mono"
                tom="fraco"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ position: 'absolute', left: 0, width: MARGEM.esquerda - 6, top: y(v) - 8, textAlign: 'right' }}
              >
                {formatarNumero(v, casas)}
              </Texto>
            ))
          : null}
        {marcas.map((t) => (
          <Texto
            key={t}
            tamanho="12"
            familia="mono"
            tom="fraco"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ position: 'absolute', top: altura - MARGEM.base + 4, left: x(t) - 24, width: 48, textAlign: 'center' }}
          >
            {formatarHoraMinuto(t * 1000)}
          </Texto>
        ))}
        {semDados ? (
          <View className="absolute inset-0 items-center justify-center">
            <Texto tom="apoio">Sem janelas no período.</Texto>
          </View>
        ) : null}
        <View
          className="absolute inset-0"
          onStartShouldSetResponder={() => !semDados}
          onMoveShouldSetResponder={() => !semDados}
          onResponderGrant={mover}
          onResponderMove={mover}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${descricao}. ${resumo}`}
          accessibilityValue={{ text: textoDaLeitura }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e: AccessibilityActionEvent) =>
            andar(e.nativeEvent.actionName === 'increment' ? 1 : -1)
          }
          testID="area-do-grafico"
        />
      </View>
    </View>
  )
}

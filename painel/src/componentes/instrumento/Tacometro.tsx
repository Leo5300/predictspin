import {
  fracaoLog,
  limitesDaEscala,
  marcasDoTacometro,
  marchaMaisProxima,
  rpmSemMilhar,
} from '@/dominio/tacometro'
import { cn } from '@/lib/utils'

type Props = {
  /** Rotação medida (rpm); nulo sem dado. */
  rpm: number | null | undefined
  /** Rotações nominais da máquina (placa de rotações). */
  nominais: readonly number[]
  /** Dado velho: ponteiro e número no tom fraco. */
  velho?: boolean
  /**
   * Gravado (replay): o número sai em Plex Mono; a matriz de pontos é só da rotação ao vivo da tela
   * da máquina (item 9 da direção).
   */
  gravado?: boolean
  className?: string
}

const LARGURA = 360
const ALTURA = 296
const CX = 180
// espaço em cima para a segunda fileira de rótulos (por fora do arco)
const CY = 156
const RAIO = 118
/** O arco vai de 210° a −30° (240° de abertura), como num tacômetro de painel. */
const INICIO_GRAUS = 210
const ABERTURA_GRAUS = 240
/** Rótulos mais próximos que isto do anterior vão para a segunda fileira, por fora. */
const AFASTAMENTO_MINIMO_GRAUS = 12

function angulo(fracao: number): number {
  return ((INICIO_GRAUS - fracao * ABERTURA_GRAUS) * Math.PI) / 180
}

function ponto(fracao: number, raio: number): { x: number; y: number } {
  const a = angulo(fracao)
  return { x: CX + raio * Math.cos(a), y: CY - raio * Math.sin(a) }
}

/**
 * Tacômetro: o arco tem as rotações nominais do torno como marcas rotuladas (escala logarítmica),
 * o ponteiro fica na rotação medida e a marcha nominal mais próxima é destacada em texto forte (traço mais longo e grosso, número em negrito).
 * O número em matriz de pontos fica embaixo, sem separador de milhar.
 */
export function Tacometro({ rpm, nominais, velho = false, gravado = false, className }: Props) {
  const [minimo, maximo] = limitesDaEscala(nominais)
  const temRotacao = rpm !== null && rpm !== undefined && Number.isFinite(rpm)
  const marcha = marchaMaisProxima(rpm, nominais)
  const fracaoAtual = temRotacao ? fracaoLog(Math.max(rpm, minimo), minimo, maximo) : 0
  const ponteiro = ponto(fracaoAtual, RAIO - 22)

  const inicio = ponto(0, RAIO)
  const fim = ponto(1, RAIO)
  const arco = `M${inicio.x.toFixed(1)} ${inicio.y.toFixed(1)} A${RAIO} ${RAIO} 0 1 1 ${fim.x.toFixed(1)} ${fim.y.toFixed(1)}`

  const marcas = marcasDoTacometro(
    nominais,
    minimo,
    maximo,
    ABERTURA_GRAUS,
    AFASTAMENTO_MINIMO_GRAUS,
  )

  const corDoPonteiro = velho || !temRotacao ? 'var(--texto-fraco)' : 'var(--texto)'

  return (
    <div className={cn('flex flex-col items-center', className)} data-velho={velho || undefined}>
      <div className="@container relative w-full max-w-sm">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          role="img"
          aria-label={
            temRotacao
              ? `Tacômetro: ${rpmSemMilhar(rpm)} rpm${marcha ? `, marcha mais próxima ${marcha} rpm` : ''}`
              : 'Tacômetro: sem rotação'
          }
          className="w-full"
        >
          <path d={arco} fill="none" stroke="var(--linha-forte)" strokeWidth="1.5" />
          {marcas.map(({ nominal, fracao: f, segundaFileira }) => {
            const destaque = nominal === marcha && !velho
            const externo = ponto(f, RAIO)
            const interno = ponto(f, RAIO - (destaque ? 14 : 9))
            // o texto sai do traço para fora: começa depois dele à direita, termina antes dele à
            // esquerda e fica centrado no alto do arco, sem cruzar traço nem arco
            const cosseno = Math.cos(angulo(f))
            const ancora = cosseno > 0.35 ? 'start' : cosseno < -0.35 ? 'end' : 'middle'
            const rotulo = ponto(
              f,
              RAIO + (ancora === 'middle' ? 11 : 7) + (segundaFileira ? 14 : 0),
            )
            return (
              <g key={nominal}>
                <line
                  x1={externo.x}
                  y1={externo.y}
                  x2={interno.x}
                  y2={interno.y}
                  stroke={destaque ? 'var(--texto)' : 'var(--texto-apoio)'}
                  strokeWidth={destaque ? 3 : 1.25}
                />
                <text
                  x={rotulo.x}
                  y={rotulo.y}
                  textAnchor={ancora}
                  dominantBaseline="middle"
                  className="valor"
                  fontSize={destaque ? 12.5 : 10.5}
                  fontWeight={destaque ? 600 : 400}
                  fill={destaque ? 'var(--texto)' : 'var(--texto-apoio)'}
                >
                  {nominal}
                </text>
              </g>
            )
          })}
          {temRotacao ? (
            <>
              <line
                x1={CX}
                y1={CY}
                x2={ponteiro.x}
                y2={ponteiro.y}
                stroke={corDoPonteiro}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle
                cx={CX}
                cy={CY}
                r="6"
                fill="var(--superficie-modulo)"
                stroke={corDoPonteiro}
                strokeWidth="2"
              />
            </>
          ) : null}
        </svg>
        {/* número entre as pontas do arco, abaixo do eixo do ponteiro; sem rotação, nenhum número
            (o texto embaixo diz "sem rotação") */}
        <span
          hidden={!temRotacao}
          className={cn(
            gravado ? 'valor font-medium' : 'matriz',
            'absolute left-1/2 -translate-x-1/2',
            // 5 dígitos (leitura com defeito, até 30000 rpm) não cabem entre as pontas do arco
            // o número acompanha a largura do mostrador (no celular, 72 px encostaria nas pontas)
            rpmSemMilhar(rpm).length > 4
              ? 'text-[min(2.5rem,11cqw)] leading-none'
              : 'text-[min(4.5rem,19cqw)] leading-none',
            velho || !temRotacao ? 'text-fraco' : 'text-texto',
          )}
          style={{ top: `${((CY + 34) / ALTURA) * 100}%` }}
          data-testid="rotacao"
        >
          {rpmSemMilhar(rpm)}
        </span>
        <span
          hidden={!temRotacao}
          className="rotulo absolute left-1/2 -translate-x-1/2"
          style={{ top: `${((CY + 112) / ALTURA) * 100}%` }}
        >
          RPM
        </span>
      </div>
      <span className="mt-1 text-13 text-apoio">
        {marcha ? (
          <>
            marcha mais próxima: <span className="valor font-medium text-texto">{marcha}</span>
          </>
        ) : temRotacao ? (
          'parado'
        ) : (
          'sem rotação'
        )}
      </span>
    </div>
  )
}

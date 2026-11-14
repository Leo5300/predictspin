import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const LARGURA = 640
const ALTURA = 222

const PARTES = [
  { nome: 'cabeçote', x: 84 },
  { nome: 'placa', x: 180 },
  { nome: 'barramento', x: 292 },
  { nome: 'carro', x: 382 },
  { nome: 'contraponto', x: 556 },
] as const

type LadoDoRotulo = 'acima' | 'abaixo' | 'esquerda'
type LadoDaBarra = 'direita' | 'esquerda'

/** Onde cada sensor fica no desenho (coordenadas do viewBox) e para que lado vão rótulo e barra. */
const POSICOES_NO_TORNO: Record<
  string,
  { x: number; y: number; rotulo: LadoDoRotulo; barra: LadoDaBarra }
> = {
  // A: face direita do cabeçote, junto à flange
  A: { x: 134, y: 150, rotulo: 'esquerda', barra: 'direita' },
  // R: logo acima da flange (sensor de rotação, 1 pulso por volta)
  R: { x: 155, y: 70, rotulo: 'acima', barra: 'direita' },
  // B: base do carro, atrás da torre porta-ferramenta
  B: { x: 414, y: 96, rotulo: 'acima', barra: 'direita' },
  // C: ponta direita do barramento
  C: { x: 600, y: 115, rotulo: 'abaixo', barra: 'esquerda' },
}

export type MarcadorNoTorno = {
  codigo: string
  /**
   * Lugar no desenho: 'A' (acionamento, no cabeçote), 'B' (ferramenta, no carro), 'C' (estrutura,
   * na ponta do barramento) ou 'R' (rotação). Vem do papel do ponto, não do código, que é livre.
   */
  lugar: 'A' | 'B' | 'C' | 'R'
  /** Texto curto com o papel do sensor (acionamento, ferramenta–peça, estrutura, rotação). */
  papel: string
  /** O marcador em si (letra + forma), normalmente dentro de um link para a tela do ponto. */
  conteudo: ReactNode
  /** RMS atual em relação ao máximo do período (0 a 1): barra vertical ao lado do marcador. */
  nivel?: number | null
  /** Texto curto ao lado do marcador (no R, a rotação). */
  leitura?: string
  /** Muda a cada janela que chega pelos eventos: o marcador emite um anel na cor de sinal. */
  chegada?: number | null
}

type Props = {
  marcadores: readonly MarcadorNoTorno[]
  /** Dado velho: barras e leituras perdem a cor de sinal e ficam em cinza claro. */
  velho?: boolean
  className?: string
}

/**
 * Esquema do torno visto de cima, só contornos em tom neutro: cabeçote à esquerda, placa com
 * flange na face direita dele, barramento (duas guias) até a direita, carro com a torre
 * porta-ferramenta ao centro e contraponto à direita. Não é 3D, não gira e não brilha: serve para
 * dizer onde cada sensor está.
 */
export function EsquemaTorno({ marcadores, velho = false, className }: Props) {
  return (
    <div
      className={cn('@container relative w-full @max-[30rem]:mb-4', className)}
      style={{ aspectRatio: `${LARGURA} / ${ALTURA}` }}
    >
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Esquema do torno visto de cima, com a posição dos sensores"
        className="absolute inset-0 size-full fill-none stroke-linha-forte"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {/* linha de centro do eixo-árvore */}
        <path d="M8 115H632" className="stroke-linha" strokeDasharray="10 4 2 4" strokeWidth="1" />

        {/* barramento: duas guias longas, da placa até a direita */}
        <rect x="200" y="86" width="414" height="12" className="fill-realce" />
        <rect x="200" y="132" width="414" height="12" className="fill-realce" />
        <path d="M200 98V132M614 98V132" className="stroke-linha" strokeWidth="1" />

        {/* cabeçote */}
        <rect x="20" y="48" width="128" height="134" className="fill-realce" />
        <path d="M34 62H134M34 168H134" className="stroke-linha" strokeWidth="1" />

        {/* flange e placa na face direita do cabeçote */}
        <rect x="148" y="94" width="14" height="42" className="fill-realce" />
        <rect x="162" y="76" width="36" height="78" className="fill-realce" />
        <path d="M162 102H198M162 128H198M174 76V154" className="stroke-linha" strokeWidth="1" />

        {/* carro sobre o barramento, com o carro superior e a torre porta-ferramenta */}
        <rect x="318" y="62" width="128" height="106" className="fill-realce" />
        <rect x="336" y="76" width="92" height="40" className="fill-realce" />
        <rect x="346" y="84" width="34" height="34" className="fill-realce" />
        <path d="M346 101H318M363 118V132" strokeWidth="2.5" />
        <path d="M318 150H446" className="stroke-linha" strokeWidth="1" />

        {/* contraponto, com o mangote apontando para a placa */}
        <rect x="520" y="80" width="72" height="70" className="fill-realce" />
        <rect x="488" y="108" width="32" height="14" className="fill-realce" />
        <path d="M488 115 476 115" strokeWidth="2.5" />

        {/* traços que ligam cada parte ao nome dela, abaixo do desenho */}
        <path
          d="M84 200V184M180 200V156M292 200V146M382 200V170M556 200V152"
          className="stroke-linha"
          strokeWidth="1"
        />
      </svg>

      {/* nomes das partes em tamanho fixo: legíveis em qualquer largura do desenho */}
      {PARTES.map((parte, indice) => (
        <span
          key={parte.nome}
          aria-hidden="true"
          className={cn(
            'rotulo absolute bottom-0 -translate-x-1/2 whitespace-nowrap @max-[30rem]:tracking-normal',
            // no desenho estreito, os nomes se alternam em duas fileiras para não se encostarem
            indice % 2 === 1 && '@max-[30rem]:translate-y-full',
          )}
          style={{ left: `${(parte.x / LARGURA) * 100}%` }}
        >
          {parte.nome}
        </span>
      ))}

      {marcadores.map((marcador) => {
        const posicao = POSICOES_NO_TORNO[marcador.lugar]
        if (!posicao) return null
        return (
          <div
            key={marcador.codigo}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{
              left: `${(posicao.x / LARGURA) * 100}%`,
              top: `${(posicao.y / ALTURA) * 100}%`,
            }}
          >
            {marcador.chegada !== undefined && marcador.chegada !== null ? (
              <span
                key={marcador.chegada}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-sinal opacity-0 motion-safe:animate-[anel-de-chegada_600ms_var(--ease-out)_both] motion-reduce:hidden"
              />
            ) : null}
            {marcador.conteudo}
            {marcador.nivel !== undefined && marcador.nivel !== null ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute flex h-6 w-1.5 flex-col justify-end border border-linha-forte bg-rebaixo',
                  posicao.barra === 'direita' ? 'left-full' : 'right-full',
                )}
              >
                <span
                  className={cn(
                    'block border-t-2',
                    velho ? 'border-linha-forte bg-linha' : 'border-sinal bg-apoio',
                  )}
                  style={{
                    height: `${Math.round(Math.min(1, Math.max(0, marcador.nivel)) * 100)}%`,
                  }}
                />
              </span>
            ) : null}
            {marcador.leitura ? (
              <span
                className={cn(
                  // desenho estreito: a leitura cairia sobre as peças (a rotação está no tacômetro)
                  'valor absolute left-full ml-1 bg-modulo px-0.5 text-12 whitespace-nowrap @max-[28rem]:hidden',
                  velho ? 'text-fraco' : 'text-texto',
                )}
                data-velho={velho || undefined}
              >
                {marcador.leitura}
              </span>
            ) : null}
            <span
              className={cn(
                'pointer-events-none absolute hidden bg-modulo px-1 text-12 whitespace-nowrap text-texto @min-[28rem]:block',
                posicao.rotulo === 'acima' && 'bottom-full -mb-1',
                posicao.rotulo === 'abaixo' && 'top-full -mt-1',
                posicao.rotulo === 'esquerda' && 'right-full -mr-1',
              )}
            >
              {marcador.papel}
            </span>
          </div>
        )
      })}
    </div>
  )
}

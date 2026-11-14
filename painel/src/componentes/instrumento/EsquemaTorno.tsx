import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const LARGURA = 640
const ALTURA = 222

const PARTES = [
  { nome: 'cabeçote', x: 84 },
  { nome: 'placa', x: 180 },
  { nome: 'barramento', x: 262 },
  { nome: 'carro', x: 382 },
  { nome: 'contraponto', x: 556 },
] as const

type LadoDoRotulo = 'acima' | 'abaixo' | 'esquerda'

/** Onde cada sensor fica no desenho (coordenadas do viewBox) e para que lado vai o rótulo. */
const POSICOES_NO_TORNO: Record<string, { x: number; y: number; rotulo: LadoDoRotulo }> = {
  // A: face direita do cabeçote, junto à flange
  A: { x: 134, y: 150, rotulo: 'esquerda' },
  // R: logo acima da flange (sensor de rotação, 1 pulso por volta)
  R: { x: 155, y: 70, rotulo: 'acima' },
  // B: base do carro, atrás da torre porta-ferramenta
  B: { x: 414, y: 96, rotulo: 'acima' },
  // C: ponta direita do barramento
  C: { x: 600, y: 115, rotulo: 'abaixo' },
}

export type MarcadorNoTorno = {
  codigo: string
  /** Texto curto com o papel do sensor (acionamento, ferramenta–peça, estrutura, rotação). */
  papel: string
  /** O marcador em si (letra + forma), normalmente dentro de um link para a tela do ponto. */
  conteudo: ReactNode
}

type Props = {
  marcadores: readonly MarcadorNoTorno[]
  className?: string
}

/**
 * Esquema do torno visto de cima, só contornos em tom neutro: cabeçote à esquerda, placa com
 * flange na face direita dele, barramento (duas guias) até a direita, carro com a torre
 * porta-ferramenta ao centro e contraponto à direita. Não é 3D, não gira e não brilha: serve para
 * dizer onde cada sensor está.
 */
export function EsquemaTorno({ marcadores, className }: Props) {
  return (
    <div
      className={cn('@container relative w-full', className)}
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
        <rect x="200" y="86" width="414" height="12" />
        <rect x="200" y="132" width="414" height="12" />
        <path d="M200 98V132M614 98V132" className="stroke-linha" strokeWidth="1" />

        {/* cabeçote */}
        <rect x="20" y="48" width="128" height="134" />
        <path d="M34 62H134M34 168H134" className="stroke-linha" strokeWidth="1" />

        {/* flange e placa na face direita do cabeçote */}
        <rect x="148" y="94" width="14" height="42" />
        <rect x="162" y="76" width="36" height="78" />
        <path d="M162 102H198M162 128H198M174 76V154" className="stroke-linha" strokeWidth="1" />

        {/* carro sobre o barramento, com o carro superior e a torre porta-ferramenta */}
        <rect x="318" y="62" width="128" height="106" className="fill-modulo" />
        <rect x="336" y="76" width="92" height="40" className="fill-modulo" />
        <rect x="346" y="84" width="34" height="34" className="fill-modulo" />
        <path d="M346 101H318M363 118V132" strokeWidth="2.5" />
        <path d="M318 150H446" className="stroke-linha" strokeWidth="1" />

        {/* contraponto, com o mangote apontando para a placa */}
        <rect x="520" y="80" width="72" height="70" className="fill-modulo" />
        <rect x="488" y="108" width="32" height="14" className="fill-modulo" />
        <path d="M488 115 476 115" strokeWidth="2.5" />

        {/* traços que ligam cada parte ao nome dela, abaixo do desenho */}
        <path
          d="M84 200V184M180 200V156M262 200V146M382 200V170M556 200V152"
          className="stroke-linha"
          strokeWidth="1"
        />
      </svg>

      {/* nomes das partes em tamanho fixo: legíveis em qualquer largura do desenho */}
      {PARTES.map((parte) => (
        <span
          key={parte.nome}
          aria-hidden="true"
          className="rotulo absolute bottom-0 -translate-x-1/2 whitespace-nowrap @max-[28rem]:tracking-normal"
          style={{ left: `${(parte.x / LARGURA) * 100}%` }}
        >
          {parte.nome}
        </span>
      ))}

      {marcadores.map((marcador) => {
        const posicao = POSICOES_NO_TORNO[marcador.codigo]
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
            {marcador.conteudo}
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

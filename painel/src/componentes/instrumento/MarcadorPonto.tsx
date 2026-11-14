import type { Avaliacao } from '@/dominio/estado'
import { ROTULO_AVALIACAO } from '@/dominio/estado'
import { grafemas } from '@/dominio/texto'
import { cn } from '@/lib/utils'

import { CAMINHO_DA_FORMA, FORMA_DA_AVALIACAO } from './formasDeEstado'

type Props = {
  /** Letra do ponto (A, B, C) ou R para o sensor de rotação. */
  codigo: string
  /** A forma e a cor mudam com o estado: círculo, triângulo (atenção) ou losango (alarme). */
  avaliacao?: Avaliacao
  tamanho?: 'pequeno' | 'medio'
  className?: string
}

const COR: Record<Avaliacao, string> = {
  sem_referencia: 'fill-modulo stroke-texto text-texto',
  normal: 'fill-modulo stroke-texto text-texto',
  atencao: 'fill-atencao stroke-atencao-sobre text-atencao-sobre',
  alarme: 'fill-alarme stroke-alarme text-alarme-sobre',
}

/** Marcador de ponto: a letra dentro de uma forma. */
export function MarcadorPonto({
  codigo,
  avaliacao = 'sem_referencia',
  tamanho = 'medio',
  className,
}: Props) {
  const forma = FORMA_DA_AVALIACAO[avaliacao]
  // dentro da forma cabem 2 caracteres; código mais longo (até 10) mostra o primeiro e o nome
  // inteiro fica na dica e no texto para leitor de tela
  const letras = grafemas(codigo)
  const visivel = letras.length <= 2 ? codigo : (letras[0] ?? '')
  const lado = tamanho === 'pequeno' ? 'size-5' : 'size-7'
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        lado,
        COR[avaliacao],
        className,
      )}
      data-estado={avaliacao}
      title={visivel === codigo ? undefined : `Ponto ${codigo}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="absolute inset-0 size-full">
        <path d={CAMINHO_DA_FORMA[forma]} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className={cn(
          'valor relative font-semibold',
          tamanho === 'pequeno' ? 'text-12' : 'text-13',
          forma === 'triangulo' && 'translate-y-[2px]',
        )}
        aria-hidden="true"
      >
        {visivel}
      </span>
      <span className="sr-only">
        Ponto {codigo}
        {avaliacao === 'sem_referencia' ? '' : `, ${ROTULO_AVALIACAO[avaliacao].toLowerCase()}`}
      </span>
    </span>
  )
}

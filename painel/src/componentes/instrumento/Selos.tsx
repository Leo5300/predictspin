import type { Avaliacao, EstadoMaquina } from '@/dominio/estado'
import { ROTULO_AVALIACAO, ROTULO_ESTADO } from '@/dominio/estado'
import { cn } from '@/lib/utils'

import { FormaDeEstado } from './FormaDeEstado'
import { FORMA_DA_AVALIACAO, type Forma } from './formasDeEstado'

const CLASSE_DA_AVALIACAO: Record<Avaliacao, string> = {
  sem_referencia: 'border-linha-forte bg-transparent text-apoio border-dashed',
  normal: 'border-normal bg-transparent text-texto',
  atencao: 'border-atencao bg-atencao text-atencao-sobre',
  alarme: 'border-alarme bg-alarme text-alarme-sobre',
}

/**
 * Avaliação do ponto ou da máquina. Hoje a API não tem referência aprendida, então o selo fica em
 * "SEM REFERÊNCIA", neutro. NORMAL, ATENÇÃO e ALARME já têm lugar: forma, cor e texto.
 */
export function SeloAvaliacao({
  avaliacao,
  className,
}: {
  avaliacao: Avaliacao
  className?: string
}) {
  return (
    <span
      data-estado={avaliacao}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 border px-1.5 text-12 font-medium tracking-[0.06em] whitespace-nowrap uppercase',
        CLASSE_DA_AVALIACAO[avaliacao],
        className,
      )}
    >
      <FormaDeEstado
        forma={FORMA_DA_AVALIACAO[avaliacao]}
        className={avaliacao === 'sem_referencia' ? 'fill-none stroke-current stroke-2' : ''}
      />
      {ROTULO_AVALIACAO[avaliacao]}
    </span>
  )
}

const FORMA_DO_ESTADO: Record<EstadoMaquina, Forma> = {
  operando: 'triangulo',
  parado: 'quadrado',
  sem_dados: 'anel',
}

/**
 * Placa de estado da máquina em matriz de pontos: OPERANDO, PARADO ou SEM DADOS. Nenhum dos três é
 * desvio, então a placa é neutra; o que os distingue é o texto, a forma e, no SEM DADOS, o tom
 * fraco com borda tracejada.
 */
export function PlacaEstado({ estado, className }: { estado: EstadoMaquina; className?: string }) {
  const semDados = estado === 'sem_dados'
  return (
    <span
      data-estado={estado}
      className={cn(
        'inline-flex h-10 w-full max-w-56 min-w-0 items-center gap-2 border bg-rebaixo px-2',
        semDados ? 'border-dashed border-linha-forte text-fraco' : 'border-linha-forte text-texto',
        className,
      )}
    >
      <FormaDeEstado
        forma={FORMA_DO_ESTADO[estado]}
        className={cn('size-3.5', estado === 'operando' && 'rotate-90')}
      />
      <span className="matriz truncate text-24">{ROTULO_ESTADO[estado]}</span>
    </span>
  )
}

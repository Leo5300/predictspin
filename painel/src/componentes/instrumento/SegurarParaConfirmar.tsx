import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  children: ReactNode
  /** Chamado quando o botão ficou pressionado pelo tempo inteiro. */
  aoConfirmar: () => void
  /** Tempo para confirmar, em ms. */
  duracaoMs?: number
  disabled?: boolean
  className?: string
}

/**
 * Segurar para confirmar: ações que não se desfazem pedem o botão pressionado por 1,5 s. O anel
 * enche de forma linear enquanto se segura e volta em 200 ms ao soltar (lento onde a pessoa decide,
 * rápido onde o sistema responde). Funciona com ponteiro e com teclado (Espaço ou Enter).
 */
export function SegurarParaConfirmar({
  children,
  aoConfirmar,
  duracaoMs = 1500,
  disabled = false,
  className,
}: Props) {
  const descricao = useId()
  const [segurando, setSegurando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const soltar = () => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
    setSegurando(false)
  }

  const pressionar = () => {
    if (disabled || temporizador.current) return
    setSegurando(true)
    temporizador.current = setTimeout(() => {
      temporizador.current = null
      setSegurando(false)
      aoConfirmar()
    }, duracaoMs)
  }

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    },
    [],
  )

  const metade = duracaoMs / 2
  // Dois semicírculos que giram: só transform, sem animar traço nem tamanho
  const estiloDaMetade = (segunda: boolean) => ({
    transform: segurando ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: segurando
      ? `transform ${metade}ms linear ${segunda ? metade : 0}ms`
      : 'transform 200ms var(--ease-out)',
  })

  return (
    <button
      type="button"
      disabled={disabled}
      data-segurando={segurando || undefined}
      aria-describedby={descricao}
      onPointerDown={(evento) => {
        if (evento.button === 0) pressionar()
      }}
      onPointerUp={soltar}
      onPointerLeave={soltar}
      onPointerCancel={soltar}
      onBlur={soltar}
      onKeyDown={(evento) => {
        if ((evento.key === ' ' || evento.key === 'Enter') && !evento.repeat) {
          evento.preventDefault()
          pressionar()
        }
      }}
      onKeyUp={(evento) => {
        if (evento.key === ' ' || evento.key === 'Enter') soltar()
      }}
      onContextMenu={(evento) => evento.preventDefault()}
      className={cn(
        'relevo inline-flex min-h-8 cursor-default touch-none items-center gap-2 rounded-2 border border-linha-forte bg-modulo px-3 text-13 font-medium text-texto select-none',
        'pointer-coarse:min-h-11 max-md:min-h-11 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="relative size-4 shrink-0 rounded-full border border-linha-forte"
      >
        <span className="absolute inset-[-1px] overflow-hidden [clip-path:inset(0_0_0_50%)]">
          <span
            className="absolute inset-0 rounded-full border-2 border-texto [clip-path:inset(0_50%_0_0)]"
            style={estiloDaMetade(false)}
          />
        </span>
        <span className="absolute inset-[-1px] overflow-hidden [clip-path:inset(0_50%_0_0)]">
          <span
            className="absolute inset-0 rounded-full border-2 border-texto [clip-path:inset(0_0_0_50%)]"
            style={estiloDaMetade(true)}
          />
        </span>
      </span>
      {children}
      <span id={descricao} className="sr-only">
        Segure por {(duracaoMs / 1000).toLocaleString('pt-BR')} s para confirmar
      </span>
    </button>
  )
}

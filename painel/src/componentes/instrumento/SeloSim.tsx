import { Explica } from '@/componentes/ui/explica'
import { cn } from '@/lib/utils'

/**
 * Selo de dado simulado. Junto com a hachura diagonal, torna impossível confundir um print de dado
 * simulado com medição.
 */
export function SeloSim({ className }: { className?: string }) {
  return (
    <span
      title="Dado simulado: não é medição"
      className={cn(
        'valor inline-flex h-4 shrink-0 items-center border border-texto bg-modulo px-1 text-12 leading-none font-semibold tracking-wider text-texto',
        className,
      )}
    >
      SIM
      <span className="sr-only"> (dado simulado, não é medição)</span>
    </span>
  )
}

/**
 * Selo de dado gravado (replay), na trama vertical própria do replay: em qualquer altura da tela, o
 * valor diz que é reprodução, não dado ao vivo (item 16 da direção).
 */
export function SeloGravado({ className }: { className?: string }) {
  return (
    <span
      title="Dado gravado: reprodução de um ensaio, não é ao vivo"
      className={cn(
        'trama-replay inline-flex h-4 shrink-0 items-center border border-texto px-1 text-12 leading-none font-semibold tracking-wider text-texto',
        className,
      )}
    >
      <span className="bg-modulo px-0.5">GRAVADO</span>
      <span className="sr-only"> (reprodução de ensaio, não é ao vivo)</span>
    </span>
  )
}

/** Faixa permanente que acompanha a tela inteira quando a fonte escolhida é Simulado. */
export function FaixaSimulado({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'hachura flex min-h-7 items-center gap-2 border-b border-linha-forte bg-modulo px-4 text-12 text-texto',
        className,
      )}
    >
      <SeloSim />
      <span className="font-semibold tracking-[0.08em] whitespace-nowrap uppercase">
        Dados simulados
      </span>
      <Explica chave="sim" className="bg-modulo" />
      <span className="min-w-0 truncate bg-modulo px-1 text-apoio">
        {/* no celular só cabe o que importa */}
        <span className="max-sm:hidden">vêm do dispositivo simulado · </span>não são medição do
        torno
      </span>
    </div>
  )
}

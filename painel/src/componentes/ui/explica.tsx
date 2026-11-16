import { Popover } from '@base-ui/react/popover'
import { CircleHelp } from 'lucide-react'

import { GLOSSARIO, nomeDoBotao, type ChaveDoGlossario } from '@/dominio/glossario'
import { cn } from '@/lib/utils'

/**
 * "?" ao lado de um termo técnico: abre um balão (não modal) com título, explicação em linguagem de
 * oficina e um mini exemplo. Abre com clique, toque, Enter ou Espaço; fecha com Esc, clique fora ou
 * novo toque. O ícone é pequeno e cinza (sem cor de sinal em repouso), mas a área de toque tem 44 px.
 */
export function Explica({ chave, className }: { chave: ChaveDoGlossario; className?: string }) {
  const termo = GLOSSARIO[chave]
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={nomeDoBotao(chave)}
        data-explica={chave}
        className={cn(
          // área de toque de 44 px em volta do ícone de 14 px, sem ocupar espaço no layout
          'relative inline-flex size-4 shrink-0 cursor-default items-center justify-center rounded-full align-middle text-apoio',
          'before:absolute before:-inset-3.5 before:content-[""]',
          '[@media(hover:hover)_and_(pointer:fine)]:hover:text-texto data-[popup-open]:text-texto',
          className,
        )}
      >
        <CircleHelp aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      </Popover.Trigger>
      <Popover.Portal>
        {/* acima do termo: o valor que o termo explica fica logo abaixo dele e não pode sumir
            atrás do balão (sem espaço em cima, o balão vira para baixo sozinho) */}
        <Popover.Positioner side="top" sideOffset={8} collisionPadding={16} className="z-50">
          <Popover.Popup
            data-testid="balao-explica"
            className={cn(
              'w-[min(20rem,calc(100vw-2rem))] origin-[var(--transform-origin)] border border-linha-forte bg-modulo p-3 text-left text-texto normal-case',
              'transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
              'data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0',
              'data-[ending-style]:opacity-0 data-[ending-style]:duration-100',
            )}
          >
            <Popover.Title className="text-15 font-semibold tracking-normal">
              {termo.titulo}
            </Popover.Title>
            <Popover.Description className="mt-1 text-13 leading-snug font-normal tracking-normal text-texto">
              {termo.explicacao}
            </Popover.Description>
            <p className="mt-2 border-t border-linha pt-2 text-13 leading-snug font-normal tracking-normal text-apoio">
              {termo.exemplo}
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

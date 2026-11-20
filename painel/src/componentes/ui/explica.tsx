import { Popover } from '@base-ui/react/popover'
import { useQuery } from '@tanstack/react-query'
import { CircleHelp } from 'lucide-react'

import { consultaLimites } from '@/api/adaptadores/referencia'
import {
  GLOSSARIO,
  interpolar,
  nomeDoBotao,
  usaValores,
  type ChaveDoGlossario,
  type ValoresDoGlossario,
} from '@/dominio/glossario'
import { cn } from '@/lib/utils'

/** Texto do balão; quem cita limites lê os valores em uso da API (só estes termos consultam). */
function Texto({ texto, chave }: { texto: string; chave: ChaveDoGlossario }) {
  return usaValores(chave) ? <TextoComValores texto={texto} /> : <>{texto}</>
}

function TextoComValores({ texto }: { texto: string }) {
  const limites = useQuery(consultaLimites()).data
  const alarme = limites?.alarme
  const valores: ValoresDoGlossario | undefined =
    limites && alarme
      ? {
          z_atencao: alarme.z_atencao,
          z_alarme: alarme.z_alarme,
          atraso_s: alarme.atraso_s,
          saida_s: alarme.saida_s,
          confianca_min: Math.round(limites.modelo.confianca_min * 100),
        }
      : undefined
  return <>{interpolar(texto, valores)}</>
}

/**
 * "?" ao lado de um termo técnico: abre um balão (não modal) com título, explicação em linguagem de
 * oficina e um mini exemplo. Abre com clique, toque, Enter ou Espaço; fecha com Esc, clique fora ou
 * novo toque. O ícone é pequeno e cinza (sem cor de sinal em repouso), mas a área de toque tem 44 px.
 * Limites citados no texto ({z_atencao}...) vêm da API.
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
              <Texto texto={termo.explicacao} chave={chave} />
            </Popover.Description>
            <p className="mt-2 border-t border-linha pt-2 text-13 leading-snug font-normal tracking-normal text-apoio">
              <Texto texto={termo.exemplo} chave={chave} />
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

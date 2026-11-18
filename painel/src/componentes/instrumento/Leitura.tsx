import { useState } from 'react'

import { Explica } from '@/componentes/ui/explica'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/componentes/ui/tooltip'
import { classeDoDesvio } from '@/dominio/estado'
import type { ChaveDoGlossario } from '@/dominio/glossario'
import { TRACO } from '@/dominio/formato'
import { cn } from '@/lib/utils'

import { FormaDeEstado } from './FormaDeEstado'
import { FORMA_DA_AVALIACAO } from './formasDeEstado'

type Tamanho = 'pequeno' | 'medio' | 'grande' | 'destaque'

const CLASSE_DO_VALOR: Record<Tamanho, string> = {
  pequeno: 'text-15',
  medio: 'text-18',
  grande: 'text-24',
  destaque: 'text-40',
}

type Props = {
  /**
   * Valor em palavras ("não", "normal 5 s"): texto em Plex Sans e só os números em fonte de valor
   * (direção, item 9).
   */
  texto?: boolean
  /** Rótulo curto em caixa-alta (RMS, PICO, CURT, 1X...). */
  rotulo: string
  /** O rótulo por extenso, mostrado ao passar o cursor ou com foco (ex.: "curtose" para CURT). */
  titulo?: string
  /** Valor já formatado em pt-BR. */
  valor: string
  /** Unidade em cinza ao lado do valor, com cerca de 70% do tamanho dele. */
  unidade?: string
  tamanho?: Tamanho
  /** Dado velho: o valor fica no tom fraco e sem peso. */
  velho?: boolean
  /** Termo do glossário: põe o "?" ao lado do rótulo (o balão explica; dispensa a dica). */
  explica?: ChaveDoGlossario
  /**
   * Valor em desvio pela referência (z acima do limite, vindo da API): âmbar ou vermelho, com a forma
   * do estado ao lado e o texto para leitor de tela. Sem desvio, o valor fica neutro.
   */
  desvio?: 'atencao' | 'alarme' | null
  className?: string
}

/**
 * Leitura de instrumento: rótulo pequeno em cima, valor mono tabular embaixo e a unidade ao lado.
 * O valor troca seco (nunca conta). Quando muda, um traço de 1 px na cor de sinal aparece sob ele
 * e some em 400 ms.
 */
export function Leitura({
  rotulo,
  titulo,
  valor,
  unidade,
  tamanho = 'medio',
  velho = false,
  texto = false,
  explica,
  desvio = null,
  className,
}: Props) {
  const emDesvio = desvio !== null && !velho
  // Conta as trocas de valor para reiniciar o traço de mudança (estado derivado durante o render)
  const [anterior, setAnterior] = useState(valor)
  const [trocas, setTrocas] = useState(0)
  if (valor !== anterior) {
    setAnterior(valor)
    setTrocas((n) => n + 1)
  }

  return (
    <div
      className={cn('flex min-w-0 flex-col', className)}
      data-velho={velho || undefined}
      data-estado={emDesvio ? desvio : undefined}
    >
      {explica ? (
        <span className="flex items-center gap-1">
          <span className="rotulo">{rotulo}</span>
          <Explica chave={explica} />
        </span>
      ) : titulo ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <abbr
                className="rotulo w-fit cursor-help no-underline"
                title={titulo}
                // focável para mostrar o nome por extenso também pelo teclado
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
              >
                {rotulo}
              </abbr>
            }
          />
          <TooltipContent>{titulo}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="rotulo">{rotulo}</span>
      )}
      <span
        className={cn(
          'relative inline-flex w-fit max-w-full min-w-0 items-baseline gap-[0.15em]',
          CLASSE_DO_VALOR[tamanho],
        )}
      >
        {emDesvio ? (
          <>
            <FormaDeEstado
              forma={FORMA_DA_AVALIACAO[desvio]}
              className={cn(
                'size-[0.45em] shrink-0 self-center',
                desvio === 'alarme' ? 'text-alarme' : 'text-atencao',
              )}
            />
            <span className="sr-only">{desvio === 'alarme' ? 'em alarme: ' : 'em atenção: '}</span>
          </>
        ) : null}
        <span
          className={cn(
            'truncate',
            !texto && 'valor',
            // velho: tom fraco e sem peso, como a regra de dado velho faz com os números
            velho
              ? 'font-normal text-fraco'
              : emDesvio
                ? cn('font-semibold', classeDoDesvio(desvio))
                : 'font-medium text-texto',
          )}
          title={valor}
        >
          {texto
            ? valor.split(/(\d[\d.,]*)/).map((parte, i) =>
                i % 2 === 1 ? (
                  <span key={i} className="valor">
                    {parte}
                  </span>
                ) : (
                  parte
                ),
              )
            : valor}
        </span>
        {/* sem valor, só o traço: unidade ao lado de nada parece um valor */}
        {unidade && valor !== TRACO ? (
          <span className="shrink-0 text-[0.7em] leading-none text-apoio">{unidade}</span>
        ) : null}
        {trocas > 0 && !velho ? (
          <span
            key={trocas}
            aria-hidden="true"
            className="absolute right-0 -bottom-0.5 left-0 h-px bg-sinal opacity-0 motion-safe:animate-[sumir_400ms_var(--ease-out)_both] motion-reduce:hidden"
          />
        ) : null}
      </span>
    </div>
  )
}

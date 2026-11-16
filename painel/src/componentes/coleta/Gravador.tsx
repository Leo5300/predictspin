import { Fragment } from 'react'

import { useSegundo } from '@/estado/relogio'
import {
  comprimentoDaFitaS,
  DURACAO_SUGERIDA_S,
  formatarCronometro,
  marcasDaFita,
  posicaoNaFita,
  type JanelaDaFita,
} from '@/dominio/fita'
import { instrucoes } from '@/dominio/instrucoes'
import type { Condicao, Etapa } from '@/dominio/coleta'
import { Kbd } from '@/componentes/ui/kbd'
import { cn } from '@/lib/utils'

/**
 * Peças do gravador da Coleta. O vermelho do REC é convenção de gravador e é o ÚNICO uso de vermelho
 * fora de alarme (exceção documentada em docs/painel.md).
 */

type PropsRec = {
  aoGravar: () => void
  desabilitado?: boolean
  ocupado?: boolean
  /** Texto curto do porquê de estar desabilitado. */
  motivo?: string
}

/** Botão REC: grande e redondo, o único círculo grande da tela. Atalho R no notebook. */
export function BotaoRec({ aoGravar, desabilitado = false, ocupado = false, motivo }: PropsRec) {
  const inativo = desabilitado || ocupado
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={aoGravar}
        disabled={inativo}
        aria-label={ocupado ? 'REC: abrindo o ensaio…' : 'REC: gravar'}
        aria-describedby={motivo ? 'motivo-rec' : undefined}
        aria-keyshortcuts="R"
        data-testid="botao-rec"
        className={cn(
          'relevo flex size-22 items-center justify-center rounded-full border-2 select-none',
          inativo
            ? 'border-dashed border-linha-forte bg-rebaixo text-apoio'
            : 'border-rec bg-modulo text-texto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce',
        )}
      >
        <span className="flex flex-col items-center gap-1">
          <span
            aria-hidden="true"
            className={cn('size-7 rounded-full', inativo ? 'bg-linha-forte' : 'bg-rec')}
          />
          <span className="text-13 font-semibold tracking-[0.12em]">REC</span>
        </span>
      </button>
      <span className="flex items-center gap-1.5 text-12 text-apoio">
        {motivo ? (
          <span id="motivo-rec" className="max-w-56 text-center text-texto">
            {motivo}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 max-md:hidden pointer-coarse:hidden">
            atalho <Kbd>R</Kbd>
          </span>
        )}
      </span>
    </div>
  )
}

/** Ponto vermelho do gravador ligado: pulso lento de opacidade (parado com movimento reduzido). */
export function PontoGravando({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-3.5 shrink-0 rounded-full bg-rec motion-safe:animate-[pulso-rec_2s_linear_infinite]',
        className,
      )}
    />
  )
}

/**
 * Cronômetro da gravação em matriz de pontos, contando desde o início do ensaio (relógio do
 * navegador corrigido pelo do servidor). Abaixo, a régua até os 60 s sugeridos: marca discreta, sem
 * alerta nem som; depois dos 60 s ele continua contando.
 */
export function Cronometro({ inicio, fim }: { inicio: string; fim?: string | null }) {
  const { epocaMs } = useSegundo()
  const ate = fim ? Date.parse(fim) : epocaMs
  const decorrido = Math.max(0, (ate - Date.parse(inicio)) / 1000)
  const preenchido = Math.min(1, decorrido / DURACAO_SUGERIDA_S)
  return (
    <div className="flex flex-col items-start gap-1" data-testid="cronometro">
      <span
        className="matriz inline-flex items-center text-[clamp(3rem,14vw,4.5rem)] leading-none text-texto"
        role="timer"
        aria-label={`Tempo gravado: ${formatarCronometro(decorrido)}`}
      >
        {/* os dois-pontos da Doto parecem "‡": o separador é desenhado (dois pontos quadrados), numa
            linha só com os algarismos; o ":" de verdade fica no texto, invisível */}
        {formatarCronometro(decorrido)
          .split(':')
          .map((parte, i) => (
            <Fragment key={i}>
              {i > 0 ? (
                <>
                  <span className="sr-only">:</span>
                  <span
                    aria-hidden="true"
                    className="mx-[0.08em] flex h-[0.62em] flex-col justify-between"
                  >
                    <span className="size-[0.12em] bg-current" />
                    <span className="size-[0.12em] bg-current" />
                  </span>
                </>
              ) : null}
              <span>{parte}</span>
            </Fragment>
          ))}
      </span>
      <span className="flex w-full max-w-64 items-center gap-2 text-12 text-apoio">
        <span aria-hidden="true" className="relative h-1 flex-1 border border-linha bg-rebaixo">
          <span
            className="absolute inset-y-0 left-0 origin-left bg-texto"
            style={{ width: '100%', transform: `scaleX(${preenchido})` }}
          />
        </span>
        <span className={cn('valor', decorrido >= DURACAO_SUGERIDA_S && 'text-texto')}>60 s</span>
      </span>
    </div>
  )
}

type PropsFita = {
  inicio: string
  fim?: string | null
  janelas: readonly JanelaDaFita[]
  eventos: readonly { instante: string; motivo: string }[]
  /** Instante do toque em "Marcar evento", antes de a API confirmar. */
  eventoPendente?: number | null
  simulado?: boolean
}

/**
 * A fita: um traço por janela recebida. Traço alto = saturada; traço oco = amostras incompletas;
 * traço tracejado com ▾ = evento marcado; linha pontilhada = 60 s.
 */
export function Fita({ inicio, fim, janelas, eventos, eventoPendente, simulado }: PropsFita) {
  const { epocaMs } = useSegundo()
  const inicioMs = Date.parse(inicio)
  const decorrido = Math.max(0, ((fim ? Date.parse(fim) : epocaMs) - inicioMs) / 1000)
  const comprimento = comprimentoDaFitaS(decorrido)
  const marcas = marcasDaFita(janelas, inicioMs, comprimento)
  const agora = Math.min(1, decorrido / comprimento)
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'relative h-14 overflow-hidden border border-linha-forte bg-rebaixo',
          simulado && 'hachura',
        )}
        role="img"
        aria-label={`Fita: ${marcas.length} ${marcas.length === 1 ? 'janela recebida' : 'janelas recebidas'}${eventos.length ? `, ${eventos.length} ${eventos.length === 1 ? 'evento marcado' : 'eventos marcados'}` : ''}`}
        data-testid="fita"
      >
        {/* parte já gravada */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 origin-left bg-modulo"
          style={{ width: '100%', transform: `scaleX(${agora})` }}
        />
        {/* 60 s sugeridos */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 border-l border-dotted border-linha-forte"
          style={{ left: `${(DURACAO_SUGERIDA_S / comprimento) * 100}%` }}
        />
        {marcas.map((m) => (
          <span
            key={m.chave}
            aria-hidden="true"
            data-tipo={m.tipo}
            className={cn(
              'absolute w-[3px] -translate-x-1/2',
              m.tipo === 'saturada' && 'top-1 bottom-1 bg-texto',
              m.tipo === 'janela' && 'top-3 bottom-3 bg-texto',
              m.tipo === 'incompleta' && 'top-3 bottom-3 border border-texto bg-rebaixo',
            )}
            style={{ left: `${m.posicao * 100}%` }}
          />
        ))}
        {[
          ...eventos.map((e) => Date.parse(e.instante)),
          ...(eventoPendente ? [eventoPendente] : []),
        ].map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="absolute inset-y-0 border-l-2 border-dashed border-texto"
            style={{ left: `${posicaoNaFita(t, inicioMs, comprimento) * 100}%` }}
          >
            <span className="absolute -top-1 -left-[5px] text-12 leading-none text-texto">▾</span>
          </span>
        ))}
        {/* cabeça de gravação */}
        {!fim ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-texto"
            style={{ left: `${agora * 100}%` }}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-12 text-apoio">
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-3 w-[3px] bg-texto" /> janela
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-4 w-[3px] bg-texto" /> saturada (traço alto)
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-3 w-[3px] border border-texto" /> amostras
          incompletas
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true">▾</span> evento marcado
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-3 border-l border-dotted border-linha-forte" /> 60 s
          sugeridos
        </span>
        <span className="ml-auto valor">{formatarCronometro(comprimento)} de fita</span>
      </div>
    </div>
  )
}

/** Cartão "o que fazer agora": texto grande e curto, sempre visível ao preparar e ao gravar. */
export function CartaoInstrucao({
  etapa,
  condicao,
  className,
}: {
  etapa: Etapa
  condicao: Condicao
  className?: string
}) {
  const { principal, sempre } = instrucoes(etapa, condicao)
  return (
    <section
      aria-label="O que fazer agora"
      className={cn('flex flex-col gap-1.5 border border-linha-forte bg-modulo p-3', className)}
      data-testid="cartao-instrucao"
    >
      <h2 className="rotulo">O que fazer agora</h2>
      <p className="text-18 leading-snug font-semibold text-texto">{principal}</p>
      <p className="text-15 text-apoio">{sempre}</p>
    </section>
  )
}

import type { Referencia } from '@/dominio/estado'
import { avaliar } from '@/dominio/estado'
import { alcanceDaRegua, posicaoNaRegua } from '@/dominio/escalas'
import { formatarG } from '@/dominio/formato'
import { cn } from '@/lib/utils'

type Props = {
  /** Valor atual (g). */
  valor: number | null | undefined
  /** Faixa normal aprendida. Hoje não existe na API: sem ela a régua fica neutra. */
  referencia?: Referencia | null
  /** Valores dos últimos 60 s, do mais antigo ao mais novo: viram o rastro do ponteiro. */
  rastro?: readonly number[]
  velho?: boolean
  /**
   * Escala da régua quando ela não está em g: em z (desvios da referência), o centro é o típico. O
   * painel só posiciona o z que a API mandou.
   */
  escala?: { formatar: (v: number) => string; rotuloCentro: string; descricao: string }
  /** Texto quando não há referência (padrão: "sem referência aprendida"). */
  textoSemReferencia?: string
  className?: string
}

const TEXTO_SEM_REFERENCIA = 'sem referência aprendida'
const ESCALA_EM_G = {
  formatar: (v: number) => formatarG(v),
  rotuloCentro: '',
  descricao: '',
}

/**
 * Régua de desvio: o centro é a referência, a faixa mais escura é a tolerância, as marcas são os
 * limites de atenção e de alarme e o ponteiro é o valor atual. O rastro mostra por onde o ponteiro
 * passou no último minuto, com opacidade decrescente. A referência chega por parâmetro; o painel
 * não a calcula.
 */
export function ReguaDesvio({
  valor,
  referencia,
  rastro = [],
  velho = false,
  escala,
  textoSemReferencia = TEXTO_SEM_REFERENCIA,
  className,
}: Props) {
  if (!referencia) {
    return (
      <div className={cn('flex flex-col gap-1', className)} data-referencia="ausente">
        <div
          className="relative h-3 border border-dashed border-linha-forte bg-rebaixo"
          role="img"
          aria-label={`Régua de desvio: ${textoSemReferencia}`}
        >
          <span className="absolute top-0 bottom-0 left-1/2 w-px bg-linha-forte" />
        </div>
        <span className="text-12 text-apoio">{textoSemReferencia}</span>
      </div>
    )
  }
  const { formatar, rotuloCentro, descricao } = escala ?? ESCALA_EM_G

  const alcance = alcanceDaRegua(referencia)
  const largura = (meia: number) => `${Math.min(100, (meia / alcance) * 100)}%`
  const posicao = (v: number) => `${posicaoNaRegua(v, referencia) * 100}%`
  const avaliacao = avaliar(valor, referencia)
  const temValor = valor !== null && valor !== undefined && Number.isFinite(valor)
  const corDoPonteiro = velho
    ? 'border-b-fraco'
    : avaliacao === 'alarme'
      ? 'border-b-alarme'
      : avaliacao === 'atencao'
        ? 'border-b-atencao-texto'
        : 'border-b-texto'

  return (
    <div
      className={cn('flex flex-col gap-1', className)}
      data-referencia="presente"
      data-estado={avaliacao}
    >
      <div
        className="relative h-3 border border-linha-forte bg-rebaixo"
        role="img"
        aria-label={
          escala
            ? `Régua de desvio: ${descricao}`
            : `Régua de desvio: valor ${formatarG(valor)} g, referência ${formatarG(referencia.centro)} g`
        }
      >
        {/* faixa de tolerância em torno do centro */}
        <span
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 bg-realce"
          style={{ width: largura(referencia.tolerancia) }}
        />
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-linha-forte" />
        {/* limites: atenção (traço) e alarme (traço duplo) */}
        <span
          className="absolute top-0 bottom-0 w-px bg-texto"
          style={{ left: posicao(referencia.atencao) }}
        />
        <span
          className="absolute top-0 bottom-0 w-[3px] border-x border-texto"
          style={{ left: posicao(referencia.alarme) }}
        />
        {/* rastro dos últimos 60 s */}
        {rastro.map((v, i) => (
          <span
            key={i}
            className="absolute top-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 bg-texto"
            style={{ left: posicao(v), opacity: 0.12 + (0.5 * (i + 1)) / rastro.length }}
          />
        ))}
        {temValor ? (
          <span
            className={cn(
              'absolute -bottom-px h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[9px] border-x-transparent',
              corDoPonteiro,
            )}
            style={{ left: posicao(valor) }}
          />
        ) : null}
      </div>
      <div className="valor flex justify-between text-12 text-apoio">
        <span>{formatar(referencia.centro - alcance)}</span>
        <span>{escala ? rotuloCentro : `ref. ${formatarG(referencia.centro)} g`}</span>
        <span>{formatar(referencia.centro + alcance)}</span>
      </div>
    </div>
  )
}

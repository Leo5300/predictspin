import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  chaveDaCelula,
  CONDICOES,
  ROTULO_CONDICAO,
  rotacoesDoPlano,
  SIGLA_CONDICAO,
  type Celula,
  type Condicao,
  type Etapa,
} from '@/dominio/coleta'
import { cn } from '@/lib/utils'

type Props = {
  grade: readonly Celula[]
  plano: readonly number[]
  /** Toque numa célula: prepara aquela gravação (escolha livre). */
  aoEscolher?: (celula: Celula) => void
  /** Célula sugerida (marca ▸). */
  sugerida?: string | null
  /** Célula que acabou de ganhar uma gravação: carimba. */
  carimbada?: string | null
  className?: string
}

type Linha = { etapa: Etapa; condicao: Condicao }

const LINHAS: Linha[] = [
  { etapa: 'T0', condicao: 'normal' },
  { etapa: 'T1', condicao: 'normal' },
  { etapa: 'T2', condicao: 'normal' },
  ...CONDICOES.map((condicao) => ({ etapa: 'T3' as const, condicao })),
]

/**
 * Matriz de cobertura: etapa × condição nas linhas, rotações do plano nas colunas, "feitos/meta" em
 * cada célula. Completa = preenchida com ✓; em andamento = borda cheia; validação (sensor solto) =
 * borda tracejada e "valid." no rótulo da linha (forma e texto, não cor). No celular, a matriz rola na
 * horizontal com a coluna da etapa fixa. Tocar em qualquer célula prepara aquela gravação.
 */
export function MatrizCobertura({
  grade,
  plano,
  aoEscolher,
  sugerida,
  carimbada,
  className,
}: Props) {
  const rotacoes = rotacoesDoPlano(plano)
  const porChave = new Map(grade.map((c) => [chaveDaCelula(c), c]))
  const colunas = Math.max(1, rotacoes.length)
  // só avisa da rolagem quando a matriz não cabe de verdade (plano com muitas rotações)
  const caixa = useRef<HTMLDivElement>(null)
  const [transborda, setTransborda] = useState(false)
  useEffect(() => {
    const elemento = caixa.current
    if (!elemento) return
    const medir = () => setTransborda(elemento.scrollWidth > elemento.clientWidth + 1)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [colunas])

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {transborda ? (
        <p className="border-b border-linha px-2 py-1 text-12 text-apoio">
          Deslize a matriz para o lado para ver as outras rotações; a coluna da etapa fica parada.
        </p>
      ) : null}
      <div ref={caixa} className="min-w-0 overflow-x-auto" data-testid="matriz-cobertura">
        <table className="w-max min-w-full border-separate border-spacing-0 text-13">
          <caption className="sr-only">
            Cobertura da coleta: ensaios válidos e meta por etapa, condição e rotação
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="rotulo sticky left-0 z-10 border-b border-linha bg-modulo px-2 py-1.5 text-left"
              >
                Etapa · condição
              </th>
              {rotacoes.length === 0 ? (
                <th scope="col" className="rotulo border-b border-linha px-2 py-1.5 text-left">
                  rpm
                </th>
              ) : (
                rotacoes.map((r) => (
                  <th
                    key={r}
                    scope="col"
                    className="border-b border-linha px-1 py-1.5 text-center font-normal"
                  >
                    <span className="valor text-13 text-texto">{r}</span>{' '}
                    <span className="text-12 text-apoio">rpm</span>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {LINHAS.map((linha) => {
              const validacao = linha.condicao === 'sensor_solto'
              return (
                <tr key={`${linha.etapa}-${linha.condicao}`}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-linha bg-modulo px-2 py-1 text-left font-normal whitespace-nowrap"
                  >
                    <span className="valor font-semibold text-texto">{linha.etapa}</span>{' '}
                    <span className="text-texto max-sm:hidden">
                      {ROTULO_CONDICAO[linha.condicao].toLowerCase()}
                    </span>
                    <span className="text-texto sm:hidden">{SIGLA_CONDICAO[linha.condicao]}</span>
                    {validacao ? <span className="text-apoio"> · valid.</span> : null}
                  </th>
                  {linha.etapa === 'T0' ? (
                    <td colSpan={colunas} className="border-b border-linha p-1">
                      <BotaoDaCelula
                        celula={porChave.get(chaveDaCelula({ ...linha, rotacao: 0 }))}
                        rotulo="0 rpm (desligado)"
                        aoEscolher={aoEscolher}
                        sugerida={sugerida}
                        carimbada={carimbada}
                      />
                    </td>
                  ) : rotacoes.length === 0 ? (
                    <td className="border-b border-linha px-2 py-1 text-12 text-apoio">
                      sem rotação no plano
                    </td>
                  ) : (
                    rotacoes.map((rotacao) => (
                      <td key={rotacao} className="border-b border-linha p-1">
                        <BotaoDaCelula
                          celula={porChave.get(chaveDaCelula({ ...linha, rotacao }))}
                          aoEscolher={aoEscolher}
                          sugerida={sugerida}
                          carimbada={carimbada}
                        />
                      </td>
                    ))
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BotaoDaCelula({
  celula,
  rotulo,
  aoEscolher,
  sugerida,
  carimbada,
}: {
  celula: Celula | undefined
  rotulo?: string
  aoEscolher?: (celula: Celula) => void
  sugerida?: string | null
  carimbada?: string | null
}) {
  if (!celula) return <span className="text-apoio">—</span>
  const chave = chaveDaCelula(celula)
  const completa = celula.faltam === 0
  const validacao = celula.uso === 'validacao'
  const ehSugerida = sugerida === chave
  const ehCarimbada = carimbada === chave
  // o nome acessível começa pelo texto visível ("2/3"), como pede a regra de rótulo e conteúdo
  const descricao = `${celula.validos}/${celula.meta}${rotulo ? ` ${rotulo}` : ''}: ${celula.etapa} ${ROTULO_CONDICAO[celula.condicao].toLowerCase()} a ${celula.rotacao} rpm${completa ? ', completa' : `, faltam ${celula.faltam}`}${validacao ? ', validação' : ''}${ehSugerida ? ', próxima sugerida' : ''}. Preparar esta gravação.`
  return (
    <button
      type="button"
      onClick={() => aoEscolher?.(celula)}
      aria-label={descricao}
      data-celula={chave}
      data-completa={completa || undefined}
      data-carimbada={ehCarimbada || undefined}
      className={cn(
        'relevo flex min-h-11 w-full min-w-14 items-center justify-center gap-1 rounded-2 border px-2 select-none',
        completa
          ? 'border-acao bg-acao text-acao-texto'
          : celula.validos > 0
            ? 'border-linha-forte bg-realce text-texto'
            : 'border-linha-forte bg-modulo text-texto',
        validacao && !completa && 'border-dashed',
        ehSugerida && 'outline-2 outline-offset-1 outline-texto',
        ehCarimbada &&
          // a gravação que acabou de entrar: contorno tracejado próprio (a sugerida tem contorno cheio
          // e ▸), além do preenchimento de meta quando ela foi atingida
          'outline-2 outline-offset-2 outline-texto outline-dashed motion-safe:animate-[carimbo_160ms_var(--ease-out)_both]',
        '[@media(hover:hover)_and_(pointer:fine)]:hover:border-texto',
      )}
    >
      {ehSugerida ? (
        // marca de "sugerida" desenhada (não é texto: o nome acessível começa pelo "0/3" visível)
        <svg viewBox="0 0 8 8" aria-hidden="true" className="size-2 shrink-0 fill-current">
          <path d="M1 0 7 4 1 8Z" />
        </svg>
      ) : null}
      {completa ? <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} /> : null}
      <span className="valor text-13 font-medium">
        {celula.validos}/{celula.meta}
      </span>
      {rotulo ? <span className="text-12 max-sm:hidden"> {rotulo}</span> : null}
    </button>
  )
}

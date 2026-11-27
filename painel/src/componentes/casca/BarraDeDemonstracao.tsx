import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  chaveDoEstadoDemo,
  consultaEstadoDemo,
  trocarCenario,
  zerarDemonstracao,
} from '@/api/demonstracao'
import { mensagemDoErro } from '@/api/erros'
import { FormaDeEstado } from '@/componentes/instrumento/FormaDeEstado'
import type { Forma } from '@/componentes/instrumento/formasDeEstado'
import { SegurarParaConfirmar } from '@/componentes/instrumento/SegurarParaConfirmar'
import { Button } from '@/componentes/ui/button'
import { Kbd } from '@/componentes/ui/kbd'
import {
  anuncioDoNivel,
  atalhoDoEvento,
  formatarContagem,
  NIVEIS_DO_BOTAO,
  ROTULO_DO_NIVEL,
  segundosParaVoltar,
  TECLA_DO_NIVEL,
  type NivelDemo,
  type NivelDoBotao,
} from '@/dominio/demonstracao'
import type { Papel } from '@/dominio/papeis'
import { useSegundo } from '@/estado/relogio'
import { cn } from '@/lib/utils'

const CHAVE_RECOLHIDA = 'ps.demo.recolhida'

/** Forma de cada nível: o mesmo vocabulário do resto do painel (círculo, triângulo, losango). */
const FORMA_DO_NIVEL: Record<NivelDemo, Forma> = {
  PARADA: 'quadrado',
  NORMAL: 'circulo',
  ATENCAO: 'triangulo',
  ALARME: 'losango',
}

/** Botão ligado: cor cheia do estado. Desligado: contorno neutro, com a forma na cor do estado. */
const CLASSE_LIGADO: Record<NivelDoBotao, string> = {
  // "!" porque o botão "outline" já pinta o aria-pressed (fundo de realce): aqui o fundo é a cor do estado
  NORMAL: 'border-acao! bg-acao! text-acao-texto!',
  ATENCAO: 'border-atencao! bg-atencao! text-atencao-sobre!',
  ALARME: 'border-alarme! bg-alarme! text-alarme-sobre!',
}

const CLASSE_DA_FORMA: Record<NivelDoBotao, string> = {
  NORMAL: 'text-texto',
  ATENCAO: 'text-atencao-texto',
  ALARME: 'text-alarme-texto',
}

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === '1'
  } catch {
    return false
  }
}

function gravarRecolhida(valor: boolean) {
  try {
    localStorage.setItem(CHAVE_RECOLHIDA, valor ? '1' : '0')
  } catch {
    /* sem armazenamento: a barra só não lembra */
  }
}

/**
 * Barra de demonstração: fica presa ao pé de todas as telas, só para ADMIN e só quando a API diz que a
 * demonstração está ligada. Troca o nível da vibração SIMULADA (normal, atenção, alarme) para o painel
 * reagir como reagiria com o torno de verdade. O botão marcado e o texto vêm sempre da resposta da API.
 */
export function BarraDeDemonstracao({ papel }: { papel: Papel }) {
  const ehAdmin = papel === 'ADMIN'
  const cliente = useQueryClient()
  const consulta = useQuery({ ...consultaEstadoDemo(), enabled: ehAdmin })
  const estado = consulta.data ?? null
  const { epocaMs } = useSegundo()
  const [recolhida, setRecolhida] = useState(lerRecolhida)
  const [anuncio, setAnuncio] = useState('')
  const nivelAnterior = useRef<NivelDemo | null>(null)

  // Zerar: apaga os alertas e as OS simulados; depois, toda tela refaz as consultas (listas, estado dos pontos)
  const zeragem = useMutation({
    mutationFn: zerarDemonstracao,
    onSuccess: (resposta) => {
      cliente.setQueryData(chaveDoEstadoDemo, resposta)
      void cliente.invalidateQueries({
        predicate: (consulta) => consulta.queryKey[0] !== chaveDoEstadoDemo[0],
      })
    },
  })

  const troca = useMutation({
    mutationFn: trocarCenario,
    onSuccess: (resposta) => {
      cliente.setQueryData(chaveDoEstadoDemo, resposta)
    },
  })
  const { mutate: trocar } = troca
  const pendente: NivelDemo | null = troca.isPending ? troca.variables : null
  // um pedido por vez: a trava é síncrona, porque dois cliques podem chegar antes de a tela renderizar
  const emAndamento = useRef(false)

  function pedir(nivel: NivelDemo) {
    if (emAndamento.current) return
    emAndamento.current = true
    trocar(nivel, {
      onSettled: () => {
        emAndamento.current = false
      },
    })
  }

  // As teclas 1, 2, 3 e 0 valem em qualquer tela, com a barra aberta ou recolhida, menos em campo de texto
  const pedirRef = useRef(pedir)
  useEffect(() => {
    pedirRef.current = pedir
  })
  const visivel = ehAdmin && estado !== null
  useEffect(() => {
    if (!visivel) return
    function aoApertar(e: KeyboardEvent) {
      const nivel = atalhoDoEvento(e)
      if (nivel === null) return
      e.preventDefault()
      pedirRef.current(nivel)
    }
    window.addEventListener('keydown', aoApertar)
    return () => window.removeEventListener('keydown', aoApertar)
  }, [visivel])

  // Anuncia a troca (a feita aqui, a automática do servidor e a de outra aba) com o texto da API
  const nivelAtual = estado?.nivel ?? null
  const mensagem = estado?.mensagem ?? ''
  useEffect(() => {
    if (nivelAtual === null) return
    if (nivelAnterior.current !== null && nivelAnterior.current !== nivelAtual) {
      setAnuncio(anuncioDoNivel(nivelAtual, mensagem))
    }
    nivelAnterior.current = nivelAtual
  }, [nivelAtual, mensagem])

  // Chegou a zero: pergunta já à API em vez de esperar o próximo ciclo
  const restanteS = estado
    ? segundosParaVoltar(estado.volta_normal_em_s, consulta.dataUpdatedAt, epocaMs)
    : null
  const zerou = restanteS !== null && restanteS <= 0
  const { refetch } = consulta
  useEffect(() => {
    if (zerou) void refetch()
  }, [zerou, refetch])

  if (!ehAdmin || estado === null) return null

  const semReferencia = !estado.referencia_ok
  const hardwareReal = estado.hardware_real_ativo
  const contagem =
    restanteS !== null && (estado.nivel === 'ATENCAO' || estado.nivel === 'ALARME')
      ? formatarContagem(restanteS)
      : null

  function alternar() {
    const nova = !recolhida
    setRecolhida(nova)
    gravarRecolhida(nova)
  }

  const avisos = (
    <>
      {semReferencia ? (
        <p className="flex items-start gap-1.5 text-13 text-texto" data-aviso="referencia">
          <FormaDeEstado forma="triangulo" className="mt-1 size-3 text-atencao-texto" />
          <span>
            Sem referência ativa para a marcha da demonstração: nenhum dado é gerado até recalcular
            a referência simulada.
          </span>
        </p>
      ) : null}
      {hardwareReal ? (
        <p className="flex items-start gap-1.5 text-13 text-texto" data-aviso="hardware">
          <FormaDeEstado forma="triangulo" className="mt-1 size-3 text-atencao-texto" />
          <span>
            Hardware real enviando: a demonstração está em pausa e volta sozinha 60 s depois que o
            torno parar de enviar.
          </span>
        </p>
      ) : null}
    </>
  )

  return (
    <section
      aria-label="Barra de demonstração"
      data-testid="barra-demonstracao"
      data-nivel={estado.nivel}
      className="sticky bottom-0 z-30 border-t border-linha-forte bg-modulo pb-[env(safe-area-inset-bottom)] text-texto"
    >
      <p role="status" aria-live="polite" className="sr-only" data-testid="anuncio-demonstracao">
        {anuncio}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
        <span className="hachura inline-flex min-h-6 items-center border border-linha-forte bg-modulo px-1.5 text-12 font-semibold tracking-[0.08em] uppercase">
          <span className="bg-modulo">Demonstração · dados simulados</span>
        </span>

        <span
          className="inline-flex items-center gap-1.5 text-13 font-semibold"
          data-testid="nivel-atual"
        >
          <FormaDeEstado forma={FORMA_DO_NIVEL[estado.nivel]} className="size-3" />
          <span className="font-normal text-apoio">Nível atual:</span>{' '}
          {ROTULO_DO_NIVEL[estado.nivel]}
        </span>

        {contagem ? (
          <span className="valor text-13 text-apoio" data-testid="contagem-demonstracao">
            volta ao normal em <span className="font-semibold text-texto">{contagem}</span>
          </span>
        ) : null}

        {recolhida && (semReferencia || hardwareReal) ? (
          <span className="text-13 font-semibold">
            {semReferencia ? 'Sem referência' : 'Hardware real enviando'}
          </span>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={!recolhida}
          aria-controls="painel-demonstracao"
          onClick={alternar}
        >
          {recolhida ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          {recolhida ? 'Abrir' : 'Recolher'}
          <span className="sr-only"> a barra de demonstração</span>
        </Button>
      </div>

      <div
        id="painel-demonstracao"
        hidden={recolhida}
        className="flex flex-col gap-2 px-4 pt-1 pb-3"
      >
        <div className="flex flex-wrap items-stretch gap-2">
          <div
            role="group"
            aria-label="Nível da vibração simulada"
            className="grid min-w-0 flex-1 grid-cols-3 gap-2 max-sm:basis-full sm:max-w-xl"
          >
            {NIVEIS_DO_BOTAO.map((nivel) => {
              const ligado = estado.nivel === nivel
              const aplicando = pendente === nivel
              return (
                <Button
                  key={nivel}
                  size="toque"
                  aria-pressed={ligado}
                  aria-busy={aplicando || undefined}
                  data-nivel={nivel}
                  onClick={() => pedir(nivel)}
                  className={cn(
                    'min-w-0 flex-col gap-0.5 px-1 sm:flex-row sm:gap-2 sm:px-3',
                    ligado ? CLASSE_LIGADO[nivel] : undefined,
                  )}
                >
                  <FormaDeEstado
                    forma={FORMA_DO_NIVEL[nivel]}
                    className={cn('size-4', ligado ? undefined : CLASSE_DA_FORMA[nivel])}
                  />
                  <span className="font-semibold tracking-[0.06em] max-sm:text-13 max-sm:tracking-normal">
                    {ROTULO_DO_NIVEL[nivel]}
                    {aplicando ? <span aria-hidden>…</span> : null}
                  </span>
                  {aplicando ? <span className="sr-only">aplicando</span> : null}
                  <Kbd className={cn(ligado && 'border-current bg-transparent text-current')}>
                    {TECLA_DO_NIVEL[nivel]}
                  </Kbd>
                </Button>
              )
            })}
          </div>

          <Button
            size="default"
            aria-pressed={estado.nivel === 'PARADA'}
            aria-busy={pendente === 'PARADA' || undefined}
            data-nivel="PARADA"
            onClick={() => pedir('PARADA')}
            className={cn(
              'max-sm:basis-full sm:self-center',
              estado.nivel === 'PARADA' && 'border-acao! bg-acao! text-acao-texto!',
            )}
          >
            <FormaDeEstado forma="quadrado" className="size-3" />
            Parar
            {pendente === 'PARADA' ? <span aria-hidden>…</span> : null}
            <Kbd
              className={cn(
                estado.nivel === 'PARADA' && 'border-current bg-transparent text-current',
              )}
            >
              {TECLA_DO_NIVEL.PARADA}
            </Kbd>
          </Button>

          <SegurarParaConfirmar
            aoConfirmar={() => zeragem.mutate()}
            disabled={zeragem.isPending}
            className="max-sm:basis-full sm:self-center"
          >
            {zeragem.isPending ? 'Zerando…' : 'Segure para zerar alertas e OS'}
          </SegurarParaConfirmar>
        </div>

        {zeragem.isError ? (
          <p role="alert" className="text-13 font-semibold text-alarme-texto">
            Não consegui zerar: {mensagemDoErro(zeragem.error)}
          </p>
        ) : null}

        {troca.isError ? (
          <p role="alert" className="text-13 font-semibold text-alarme-texto">
            Não consegui trocar o nível: {mensagemDoErro(troca.error)}
          </p>
        ) : null}

        {semReferencia || hardwareReal ? (
          <div className="flex flex-col gap-1">{avisos}</div>
        ) : (
          <p className="text-13 text-apoio" data-testid="mensagem-demonstracao">
            {estado.mensagem}
          </p>
        )}
      </div>
    </section>
  )
}

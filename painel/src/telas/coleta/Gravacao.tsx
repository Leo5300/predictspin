import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Copy, Flag, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  chavesColeta,
  consultaEventosMarcados,
  consultaJanelasDoEnsaio,
  descartarEnsaio,
  encerrarEnsaio,
  marcarEvento,
  type Motivo,
} from '@/api/coleta'
import { ErroApi, mensagemDoErro } from '@/api/erros'
import type { Ensaio } from '@/api/tipos'
import { CartaoInstrucao, Cronometro, Fita, PontoGravando } from '@/componentes/coleta/Gravador'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SegurarParaConfirmar } from '@/componentes/instrumento/SegurarParaConfirmar'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Button } from '@/componentes/ui/button'
import { Kbd } from '@/componentes/ui/kbd'
import { ROTULO_CONDICAO } from '@/dominio/coleta'
import { formatarRpm, TRACO } from '@/dominio/formato'
import { RECEITA_VAZIA, receitaDoEnsaio, resumoDaReceita } from '@/dominio/receita'
import { avancar, etapaAtual } from '@/dominio/sessao'
import { definirSessaoDeColeta, obterSessaoDeColeta } from '@/estado/coleta'
import { useFrescorDaMaquina } from '@/hooks/useFrescorDaMaquina'
import { useManterTelaAcesa } from '@/hooks/useManterTelaAcesa'
import { useMaquinaAoVivo } from '@/hooks/useMaquinaAoVivo'
import { copiarTexto } from '@/lib/copiar'
import { cn } from '@/lib/utils'

const MOTIVOS: { valor: Motivo; rotulo: string }[] = [
  { valor: 'pancada', rotulo: 'Pancada' },
  { valor: 'cavaco', rotulo: 'Cavaco' },
  { valor: 'maquina_vizinha', rotulo: 'Máquina vizinha' },
  { valor: 'outro', rotulo: 'Outro' },
]

const AVISO_TELA = 'ps.aviso-tela-acesa'

/**
 * Gravação em andamento. O painel não fala com o dispositivo: o ensaio aberto na API faz as janelas
 * que chegam ficarem ligadas a ele. Não para sozinho; quem encerra é a pessoa. Recarregar a página
 * com o ensaio aberto volta para cá.
 */
export function Gravacao({ ensaio, maquinaId }: { ensaio: Ensaio; maquinaId: number }) {
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const aoVivo = useMaquinaAoVivo(maquinaId)
  const { frescor, idadeS } = useFrescorDaMaquina(aoVivo.ultima, aoVivo.modoRapido)
  const anteriores = useQuery(consultaJanelasDoEnsaio(ensaio.id))
  const eventos = useQuery({ ...consultaEventosMarcados(ensaio.id), refetchInterval: 30_000 })
  const telaAcesa = useManterTelaAcesa(true)
  const [encerrando, setEncerrando] = useState(false)
  const [marcando, setMarcando] = useState<number | null>(null)
  const [nota, setNota] = useState('')
  const [enviandoEvento, setEnviandoEvento] = useState(false)
  const botaoMarcar = useRef<HTMLButtonElement>(null)

  // janelas do ensaio: as que já estavam gravadas mais as que chegam ao vivo
  const janelas = useMemo(() => {
    const doEnsaio = aoVivo.recentes.filter((j) => j.ensaio_id === ensaio.id)
    const todas = [...(anteriores.data ?? []), ...doEnsaio]
    const vistas = new Map(todas.map((j) => [j.id, j]))
    return [...vistas.values()].sort((a, b) => Date.parse(a.medido_em) - Date.parse(b.medido_em))
  }, [anteriores.data, aoVivo.recentes, ensaio.id])
  const ultima = janelas.at(-1)
  const ultimaDaMaquina = aoVivo.ultima?.janela
  const rotacaoAtual = frescor === 'vivo' ? ultimaDaMaquina?.rotacao_rpm : undefined

  // aviso único quando o navegador não deixa manter a tela acesa
  useEffect(() => {
    if (telaAcesa !== 'sem_suporte' && telaAcesa !== 'negada') return
    try {
      if (sessionStorage.getItem(AVISO_TELA)) return
      sessionStorage.setItem(AVISO_TELA, '1')
    } catch {
      /* sem armazenamento: avisa mesmo assim */
    }
    toast(
      'Este navegador não mantém a tela acesa: desligue o bloqueio de tela durante a gravação.',
      {
        duration: 10_000,
      },
    )
  }, [telaAcesa])

  const comecarMarcacao = () => {
    if (marcando !== null) return
    setMarcando(Date.now())
    setNota('')
  }

  const enviarEvento = async (motivo: Motivo) => {
    if (marcando === null) return
    setEnviandoEvento(true)
    try {
      const novo = await marcarEvento(ensaio.id, {
        ocorrido_em: new Date(marcando).toISOString(),
        motivo,
        nota: nota.trim() || undefined,
      })
      cliente.setQueryData(chavesColeta.eventos(ensaio.id), (atual: typeof eventos.data) => [
        ...(atual ?? []),
        novo,
      ])
      toast(`Evento marcado: ${MOTIVOS.find((m) => m.valor === motivo)?.rotulo ?? motivo}`)
      setMarcando(null)
      botaoMarcar.current?.focus()
    } catch (e) {
      toast(mensagemDoErro(e))
    } finally {
      setEnviandoEvento(false)
    }
  }

  const encerrar = async () => {
    setEncerrando(true)
    try {
      const encerrado = await encerrarEnsaio(ensaio.id)
      // sessão encadeada: a etapa gravada avança a sessão
      const sessao = obterSessaoDeColeta()
      if (
        sessao?.maquinaId === maquinaId &&
        sessao.simulado === encerrado.simulado &&
        etapaAtual(sessao) === encerrado.etapa
      ) {
        definirSessaoDeColeta(
          avancar(sessao, {
            etapa: encerrado.etapa,
            ensaioId: encerrado.id,
            codigo: encerrado.codigo,
          }),
        )
      }
      cliente.setQueryData(chavesColeta.ensaioAberto(maquinaId), null)
      void cliente.invalidateQueries({ queryKey: ['cobertura', maquinaId] })
      void navegar({ to: '/coleta', search: { maquina: maquinaId, resumo: encerrado.id } })
    } catch (e) {
      if (e instanceof ErroApi && e.status === 409) {
        // já estava encerrado (outra aba ou outra pessoa)
        cliente.setQueryData(chavesColeta.ensaioAberto(maquinaId), null)
        void navegar({ to: '/coleta', search: { maquina: maquinaId, resumo: ensaio.id } })
      } else {
        toast(mensagemDoErro(e))
      }
    } finally {
      setEncerrando(false)
    }
  }

  const descartar = async () => {
    try {
      await descartarEnsaio(ensaio.id)
      cliente.setQueryData(chavesColeta.ensaioAberto(maquinaId), null)
      void cliente.invalidateQueries({ queryKey: ['cobertura', maquinaId] })
      toast(`Gravação ${ensaio.codigo} descartada (marcada, não apagada).`)
      void navegar({ to: '/coleta', search: { maquina: maquinaId } })
    } catch (e) {
      toast(mensagemDoErro(e))
    }
  }

  // atalhos: E marca evento, Esc cancela a marcação. Atalho não anima.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      const digitando = !!alvo?.closest('input, textarea, select, [contenteditable="true"]')
      if (e.key === 'Escape' && marcando !== null) {
        e.preventDefault()
        setMarcando(null)
        botaoMarcar.current?.focus()
      } else if ((e.key === 'e' || e.key === 'E') && !digitando) {
        e.preventDefault()
        comecarMarcacao()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  })

  const receita = receitaDoEnsaio(ensaio)
  const linhasDaReceita = resumoDaReceita(receita)
  const comando = `python analise/captura.py --porta COM5 --segundos 60 --saida dados/${ensaio.codigo}.csv`
  const listaEventos = (eventos.data ?? []).map((e) => ({
    instante: e.ocorrido_em,
    motivo: e.motivo,
  }))

  return (
    <div className="flex flex-col gap-3 pb-44 lg:pb-0" data-testid="gravacao">
      {/* faixa de gravação: ponto vermelho (convenção de gravador), etapa e código */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-2 border border-linha-forte bg-modulo px-3 py-2',
          ensaio.simulado && 'hachura',
        )}
        role="status"
      >
        <span className="flex items-center gap-2 bg-modulo px-1">
          <PontoGravando />
          <span className="text-15 font-semibold tracking-[0.12em] text-texto">GRAVANDO</span>
          {ensaio.simulado ? <SeloSim /> : null}
        </span>
        <span className="bg-modulo px-1 text-15 text-texto">
          <span className="valor font-semibold">{ensaio.etapa}</span> ·{' '}
          {ROTULO_CONDICAO[ensaio.condicao]} ·{' '}
          <span className="valor">{ensaio.rotacao_alvo_rpm}</span> rpm
        </span>
        <CodigoDoEnsaio codigo={ensaio.codigo} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <Painel>
          <Modulo rotulo="Gravação" simulado={ensaio.simulado}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <Cronometro inicio={ensaio.iniciado_em} />
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex flex-col">
                    <dt className="rotulo">Janelas</dt>
                    <dd className="valor text-32 text-texto" data-testid="contador-janelas">
                      {janelas.length}
                    </dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="rotulo">Rotação · alvo</dt>
                    <dd className="text-24 text-texto">
                      <span className="valor" data-velho={frescor !== 'vivo' || undefined}>
                        {rotacaoAtual === undefined ? TRACO : formatarRpm(rotacaoAtual)}
                      </span>
                      <span className="text-15 text-apoio">
                        {' '}
                        / <span className="valor">{ensaio.rotacao_alvo_rpm}</span> rpm
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
              {frescor !== 'vivo' ? (
                <p className="border border-dashed border-linha-forte px-2 py-1 text-13 text-texto">
                  Nenhuma janela {idadeS !== null ? `há ${Math.round(idadeS)} s` : 'chegou ainda'}:
                  confira o dispositivo. A gravação continua aberta.
                </p>
              ) : null}
              <Fita
                inicio={ensaio.iniciado_em}
                janelas={janelas}
                eventos={listaEventos}
                eventoPendente={marcando}
                simulado={ensaio.simulado}
              />
              {ultima ? null : (
                <p className="text-13 text-apoio">
                  A primeira janela aparece na fita quando o dispositivo enviar (a cada 5 s).
                </p>
              )}
            </div>
          </Modulo>
          {marcando !== null ? (
            <Modulo rotulo="Marcar evento" detalhe="o instante já foi guardado: o do toque">
              <div className="flex flex-col gap-3" data-testid="painel-evento">
                <div className="grid grid-cols-2 gap-2">
                  {MOTIVOS.map((m) => (
                    <Button
                      key={m.valor}
                      className="min-h-14 text-15"
                      disabled={enviandoEvento}
                      onClick={() => void enviarEvento(m.valor)}
                    >
                      {m.rotulo}
                    </Button>
                  ))}
                </div>
                <label className="flex flex-col gap-1">
                  <span className="rotulo">Nota (opcional, antes de escolher o motivo)</span>
                  <input
                    value={nota}
                    maxLength={500}
                    onChange={(e) => setNota(e.target.value)}
                    className="min-h-11 rounded-2 border border-linha-forte bg-rebaixo px-2.5 text-15"
                  />
                </label>
                <Button variant="ghost" onClick={() => setMarcando(null)}>
                  Cancelar <Kbd>Esc</Kbd>
                </Button>
              </div>
            </Modulo>
          ) : null}
        </Painel>

        <div className="flex flex-col gap-3">
          <CartaoInstrucao etapa={ensaio.etapa} condicao={ensaio.condicao} />
          <Painel>
            <Modulo rotulo="Receita usada">
              {linhasDaReceita.length === 0 ? (
                <p className="text-13 text-apoio">
                  {JSON.stringify(receita) === JSON.stringify(RECEITA_VAZIA)
                    ? 'Sem receita: nada foi preenchido.'
                    : ''}
                </p>
              ) : (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-13">
                  {linhasDaReceita.map((l) => (
                    <div key={l.rotulo} className="contents">
                      <dt className="text-apoio">{l.rotulo}</dt>
                      <dd className="truncate text-texto" title={l.valor}>
                        {l.valor}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Modulo>
            <details className="bg-modulo">
              <summary className="flex min-h-11 cursor-default items-center gap-2 px-3 text-13 font-medium select-none">
                Sinal bruto pela serial (analise/captura.py)
              </summary>
              <div className="flex flex-col gap-2 px-3 pb-3">
                <code className="valor block rounded-2 border border-linha bg-rebaixo p-2 text-12 break-all text-texto">
                  {comando}
                </code>
                <p className="text-12 text-apoio">
                  Troque COM5 pela porta do ESP32. O código do ensaio vai no nome do arquivo.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    void copiarTexto(comando).then((ok) =>
                      toast(ok ? 'Comando copiado.' : 'Não deu para copiar: selecione o texto.'),
                    )
                  }}
                >
                  <Copy aria-hidden="true" strokeWidth={1.5} /> Copiar comando
                </Button>
              </div>
            </details>
          </Painel>
          <div className="hidden lg:block">
            <Controles
              aoMarcar={comecarMarcacao}
              aoEncerrar={() => void encerrar()}
              aoDescartar={() => void descartar()}
              encerrando={encerrando}
              marcando={marcando !== null}
              refMarcar={botaoMarcar}
            />
          </div>
        </div>
      </div>

      {/* zona do polegar (celular): marcar evento e encerrar embaixo; descartar segurando */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linha-forte bg-modulo px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <Controles
          aoMarcar={comecarMarcacao}
          aoEncerrar={() => void encerrar()}
          aoDescartar={() => void descartar()}
          encerrando={encerrando}
          marcando={marcando !== null}
        />
      </div>
    </div>
  )
}

function Controles({
  aoMarcar,
  aoEncerrar,
  aoDescartar,
  encerrando,
  marcando,
  refMarcar,
}: {
  aoMarcar: () => void
  aoEncerrar: () => void
  aoDescartar: () => void
  encerrando: boolean
  marcando: boolean
  refMarcar?: React.Ref<HTMLButtonElement>
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button
          ref={refMarcar}
          className="min-h-14 text-15"
          onClick={aoMarcar}
          disabled={marcando}
          aria-keyshortcuts="E"
        >
          <Flag aria-hidden="true" strokeWidth={1.75} />
          Marcar evento <Kbd>E</Kbd>
        </Button>
        <Button
          variant="default"
          className="min-h-14 text-15"
          onClick={aoEncerrar}
          disabled={encerrando}
        >
          <Square aria-hidden="true" strokeWidth={1.75} />
          {encerrando ? 'Encerrando…' : 'Encerrar'}
        </Button>
      </div>
      <SegurarParaConfirmar aoConfirmar={aoDescartar} className="justify-center self-stretch">
        Segure para descartar
      </SegurarParaConfirmar>
    </div>
  )
}

function CodigoDoEnsaio({ codigo }: { codigo: string }) {
  return (
    <span className="ml-auto flex items-center gap-2 bg-modulo px-1">
      <span className="valor text-15 font-semibold text-texto" data-testid="codigo-ensaio">
        {codigo}
      </span>
      <Button
        size="icon"
        variant="outline"
        aria-label={`Copiar o código ${codigo}`}
        onClick={() => {
          void copiarTexto(codigo).then((ok) =>
            toast(ok ? 'Código copiado.' : 'Não deu para copiar: anote o código.'),
          )
        }}
      >
        <Copy aria-hidden="true" strokeWidth={1.5} />
      </Button>
    </span>
  )
}

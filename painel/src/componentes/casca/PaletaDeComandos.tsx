import { Dialog } from '@base-ui/react/dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { useRef } from 'react'
import { toast } from 'sonner'

import { consultaCobertura } from '@/api/coleta'
import { consultaMaquina, consultaMaquinas, consultaPontos } from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import type { Papel } from '@/api/tipos'
import { Kbd } from '@/componentes/ui/kbd'
import { gradeDeCobertura, proximaSugerida, rotacoesDaConsulta } from '@/dominio/coleta'
import { podeAbrir } from '@/dominio/papeis'
import { obterMetaDaColeta } from '@/estado/coleta'
import { definirFonte, definirTema, obterFonte } from '@/estado/preferencias'

const CLASSE_ITEM =
  'flex min-h-11 cursor-default items-center gap-3 px-3 text-15 text-texto data-[selected=true]:bg-realce data-[selected=true]:outline-2 data-[selected=true]:-outline-offset-2 data-[selected=true]:outline-foco'

/**
 * Paleta de comandos: ir para as telas, para a máquina e os pontos, trocar tema e fonte, ligar o AO
 * VIVO e preparar a próxima gravação sugerida. Abre e fecha sem animação (é atalho de teclado, usado
 * muitas vezes).
 */
export function PaletaDeComandos({
  aberta,
  aoMudar,
  papel,
}: {
  aberta: boolean
  aoMudar: (aberta: boolean) => void
  papel: Papel
}) {
  const navegar = useNavigate()
  const campo = useRef<HTMLInputElement>(null)
  const cliente = useQueryClient()
  const maquinas = useQuery({ ...consultaMaquinas(), enabled: aberta })
  const primeira = maquinas.data?.conteudo[0]
  const pontos = useQuery({ ...consultaPontos(primeira?.id ?? 0), enabled: aberta && !!primeira })

  const executar = (acao: () => void | Promise<void>) => {
    aoMudar(false)
    void Promise.resolve(acao()).catch((e: unknown) => toast(mensagemDoErro(e)))
  }

  const prepararSugerida = async () => {
    if (!primeira) return
    const simulado = obterFonte() === 'simulado'
    const meta = obterMetaDaColeta()
    const maquina = await cliente.query(consultaMaquina(primeira.id))
    const plano = maquina.rotacoes_coleta_rpm
    const cobertura = await cliente.query(
      consultaCobertura(primeira.id, simulado, meta, rotacoesDaConsulta(plano)),
    )
    const sugerida = proximaSugerida(gradeDeCobertura(cobertura.itens, plano, meta))
    if (!sugerida) {
      toast('A cobertura está completa nesta meta.')
      return
    }
    await navegar({
      to: '/coleta/preparar',
      search: {
        maquina: primeira.id,
        etapa: sugerida.etapa,
        condicao: sugerida.condicao,
        rotacao: sugerida.rotacao,
      },
    })
  }

  const coleta = podeAbrir(papel, 'coleta')
  const codigosDosPontos = (pontos.data ?? [])
    .filter((p) => p.ativo)
    .map((p) => p.codigo)
    .sort()

  return (
    <Dialog.Root open={aberta} onOpenChange={(a) => aoMudar(a)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-fundo/70" />
        <Dialog.Popup
          initialFocus={campo}
          aria-label="Paleta de comandos"
          className="fixed top-[12vh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 border border-linha-forte bg-modulo text-texto"
        >
          <Dialog.Title className="sr-only">Paleta de comandos</Dialog.Title>
          <Command label="Comandos" loop>
            <div className="flex items-center gap-2 border-b border-linha px-3">
              <Command.Input
                ref={campo}
                placeholder="Ir para, máquina, tema, AO VIVO…"
                className="min-h-12 w-full bg-transparent text-15 text-texto outline-none placeholder:text-apoio"
              />
              <Kbd>Esc</Kbd>
              {/* no toque não há Esc: um botão para fechar */}
              <Dialog.Close className="relevo min-h-11 shrink-0 rounded-2 border border-linha-forte bg-modulo px-3 text-13 font-medium text-texto sm:hidden">
                Fechar
              </Dialog.Close>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto py-1">
              <Command.Empty className="px-3 py-3 text-13 text-apoio">
                Nenhum comando.
              </Command.Empty>
              <Command.Group
                heading="Ir para"
                className="[&_[cmdk-group-heading]]:rotulo [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
              >
                <Command.Item
                  className={CLASSE_ITEM}
                  onSelect={() => executar(() => navegar({ to: '/' }))}
                >
                  Visão geral
                </Command.Item>
                {coleta ? (
                  <>
                    <Command.Item
                      className={CLASSE_ITEM}
                      onSelect={() => executar(() => navegar({ to: '/coleta' }))}
                    >
                      Coleta
                    </Command.Item>
                    <Command.Item
                      className={CLASSE_ITEM}
                      onSelect={() => executar(() => navegar({ to: '/coleta/ensaios' }))}
                    >
                      Ensaios gravados
                    </Command.Item>
                  </>
                ) : null}
                <Command.Item
                  className={CLASSE_ITEM}
                  onSelect={() => executar(() => navegar({ to: '/diagnostico' }))}
                >
                  Diagnóstico
                </Command.Item>
                <Command.Item
                  className={CLASSE_ITEM}
                  onSelect={() => executar(() => navegar({ to: '/alarmes' }))}
                >
                  Alarmes e ordens de serviço
                </Command.Item>
              </Command.Group>
              {primeira ? (
                <Command.Group
                  heading="Máquina e pontos"
                  className="[&_[cmdk-group-heading]]:rotulo [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
                >
                  {(maquinas.data?.conteudo ?? []).map((m) => (
                    <Command.Item
                      key={m.id}
                      value={`máquina ${m.codigo}`}
                      className={CLASSE_ITEM}
                      onSelect={() =>
                        executar(() =>
                          navegar({ to: '/maquinas/$maquinaId', params: { maquinaId: m.id } }),
                        )
                      }
                    >
                      Máquina <span className="valor">{m.codigo}</span>
                    </Command.Item>
                  ))}
                  {codigosDosPontos.map((c) => (
                    <Command.Item
                      key={c}
                      value={`ponto ${c}`}
                      className={CLASSE_ITEM}
                      onSelect={() =>
                        executar(() =>
                          navegar({
                            to: '/maquinas/$maquinaId/pontos/$codigo',
                            params: { maquinaId: primeira.id, codigo: c },
                          }),
                        )
                      }
                    >
                      <span>
                        Ponto <span className="valor">{c}</span>
                      </span>
                    </Command.Item>
                  ))}
                  {codigosDosPontos.map((c) => (
                    <Command.Item
                      key={`vivo-${c}`}
                      value={`ao vivo ponto ${c}`}
                      className={CLASSE_ITEM}
                      onSelect={() =>
                        executar(() =>
                          navegar({
                            to: '/maquinas/$maquinaId/pontos/$codigo',
                            params: { maquinaId: primeira.id, codigo: c },
                            search: { vivo: true },
                          }),
                        )
                      }
                    >
                      <span>
                        AO VIVO no ponto <span className="valor">{c}</span>
                      </span>
                    </Command.Item>
                  ))}
                  {coleta ? (
                    <Command.Item
                      value="preparar próxima gravação sugerida coleta"
                      className={CLASSE_ITEM}
                      onSelect={() => executar(prepararSugerida)}
                    >
                      Preparar a próxima gravação sugerida
                    </Command.Item>
                  ) : null}
                </Command.Group>
              ) : null}
              <Command.Group
                heading="Aparência e fonte dos dados"
                className="[&_[cmdk-group-heading]]:rotulo [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
              >
                <Command.Item
                  className={CLASSE_ITEM}
                  onSelect={() => executar(() => definirTema('grafite'))}
                >
                  Tema grafite
                </Command.Item>
                <Command.Item
                  className={CLASSE_ITEM}
                  onSelect={() => executar(() => definirTema('claro'))}
                >
                  Tema claro
                </Command.Item>
                <Command.Item
                  className={CLASSE_ITEM}
                  onSelect={() => executar(() => definirFonte('real'))}
                >
                  Fonte: dados reais
                </Command.Item>
                <Command.Item
                  className={CLASSE_ITEM}
                  onSelect={() => executar(() => definirFonte('simulado'))}
                >
                  Fonte: dados simulados
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

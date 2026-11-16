import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Search } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { URL_API } from '@/api/cliente'
import {
  consultaCatalogo,
  desativarItem,
  renomearItem,
  type ItemCatalogo,
  type TipoCatalogo,
} from '@/api/coleta'
import {
  consultaQualidade,
  consultaTodosOsDispositivos,
  consultaUsuarios,
  criarUsuario,
  desativarUsuario,
} from '@/api/diagnostico'
import { ErroApi, mensagemDoErro } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import type { Janela, Papel } from '@/api/tipos'
import { MensagemDoCampo } from '@/componentes/coleta/CamposReceita'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SegurarParaConfirmar } from '@/componentes/instrumento/SegurarParaConfirmar'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Button, buttonVariants } from '@/componentes/ui/button'
import { Input } from '@/componentes/ui/input'
import {
  formatarDataHora,
  formatarHora,
  formatarNumero,
  formatarPercentual,
  fracao,
  TRACO,
} from '@/dominio/formato'
import { paresParecidos } from '@/dominio/nomes'
import { podeAbrir, ROTULO_PAPEL_USUARIO } from '@/dominio/papeis'
import { useFonte } from '@/estado/preferencias'
import { useMaquinaDaColeta } from '@/hooks/useMaquinaDaColeta'
import { cn } from '@/lib/utils'

/**
 * L4 — Diagnóstico: o estado do sistema de medição, não da máquina. Dispositivos, qualidade das
 * últimas janelas, atalho para os ensaios, catálogos da receita, usuários (só ADMIN) e "sobre".
 */
export function TelaDiagnostico() {
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const { maquinas, id } = useMaquinaDaColeta(undefined)
  useEffect(() => {
    document.title = 'Diagnóstico · PredictSpin'
  }, [])
  if (maquinas.isPending) return <EstadoCarregando />
  if (maquinas.isError) return <EstadoErro erro={maquinas.error} />
  const maquina = maquinas.data.conteudo.find((m) => m.id === id)
  return (
    <div className="flex flex-col gap-3">
      <header>
        <h1 className="text-24 font-semibold">Diagnóstico</h1>
        <p className="text-13 text-apoio">
          O sistema de medição: dispositivos, qualidade das janelas, cadastros e versão.
          {maquina ? (
            <>
              {' '}
              Máquina <span className="valor text-texto">{maquina.codigo}</span>.
            </>
          ) : null}
        </p>
      </header>
      {id === undefined ? (
        <Painel className="max-w-2xl">
          <Modulo rotulo="Dispositivos" semRecuo>
            <EstadoVazio titulo="Nenhuma máquina cadastrada." />
          </Modulo>
        </Painel>
      ) : (
        <Painel className="xl:grid-cols-12">
          <Dispositivos maquinaId={id} />
          <Qualidade maquinaId={id} />
          {podeAbrir(papel, 'ensaios') ? <AtalhoEnsaios maquinaId={id} /> : null}
          <Sobre />
        </Painel>
      )}
      {podeAbrir(papel, 'catalogos') ? (
        <Painel className="lg:grid-cols-2">
          <Catalogo tipo="materiais" admin={papel === 'ADMIN'} />
          <Catalogo tipo="ferramentas" admin={papel === 'ADMIN'} />
        </Painel>
      ) : null}
      {podeAbrir(papel, 'usuarios') ? <Usuarios /> : null}
    </div>
  )
}

function Dispositivos({ maquinaId }: { maquinaId: number }) {
  const dispositivos = useQuery(consultaTodosOsDispositivos(maquinaId))
  return (
    <Modulo rotulo="Dispositivos" className="xl:col-span-5" semRecuo>
      {dispositivos.isPending ? (
        <EstadoCarregando />
      ) : dispositivos.isError ? (
        <EstadoErro erro={dispositivos.error} />
      ) : dispositivos.data.length === 0 ? (
        <EstadoVazio titulo="Nenhum dispositivo cadastrado nesta máquina." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-linha text-left">
                <th scope="col" className="rotulo px-3 py-1.5">
                  Identificador
                </th>
                <th scope="col" className="rotulo px-3 py-1.5">
                  Origem
                </th>
                <th scope="col" className="rotulo px-3 py-1.5">
                  Último contato
                </th>
                <th scope="col" className="rotulo px-3 py-1.5">
                  Firmware
                </th>
                <th scope="col" className="rotulo px-3 py-1.5">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {dispositivos.data.map((d) => (
                <tr key={d.id} className="border-b border-linha last:border-b-0">
                  <td className="valor px-3 py-2 font-medium text-texto">{d.identificador}</td>
                  <td className="px-3 py-2">
                    {d.simulado ? (
                      <span className="flex items-center gap-1.5">
                        <SeloSim /> simulado
                      </span>
                    ) : (
                      'real'
                    )}
                  </td>
                  <td className="valor px-3 py-2 whitespace-nowrap">
                    {d.ultimo_contato ? formatarDataHora(d.ultimo_contato) : 'nunca'}
                  </td>
                  <td className="valor px-3 py-2">{d.firmware_versao ?? TRACO}</td>
                  <td className="px-3 py-2">{d.ativo ? 'ativo' : 'inativo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-linha px-3 py-1.5 text-12 text-apoio">
            Último contato gravado pela API com resolução de 10 s.
          </p>
        </div>
      )}
    </Modulo>
  )
}

/** Atraso: recebido_em − medido_em, em segundos (relógio do servidor contra o do dispositivo). */
function atrasoS(j: Janela): number {
  return (Date.parse(j.recebido_em) - Date.parse(j.medido_em)) / 1000
}

function Qualidade({ maquinaId }: { maquinaId: number }) {
  const simulado = useFonte() === 'simulado'
  const janelas = useQuery(consultaQualidade(maquinaId, simulado))
  const lista = janelas.data ?? []
  const saturadas = lista.filter((j) => j.saturou).length
  const incompletas = lista.filter((j) => {
    const f = fracao(j.amostras, j.amostras_esperadas)
    return f !== null && f < 0.98
  }).length
  return (
    <Modulo
      rotulo="Qualidade das últimas janelas"
      detalhe={
        lista.length > 0 ? (
          <>
            {lista.length} janelas · {saturadas} saturadas · {incompletas} com amostras abaixo de
            98%
          </>
        ) : undefined
      }
      simulado={simulado && lista.length > 0}
      className="xl:col-span-7"
      semRecuo
    >
      {janelas.isPending ? (
        <EstadoCarregando />
      ) : janelas.isError ? (
        <EstadoErro erro={janelas.error} />
      ) : lista.length === 0 ? (
        <EstadoVazio titulo={`Nenhuma janela ${simulado ? 'simulada' : 'real'} recebida.`} />
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-13">
            <thead className="sticky top-0 bg-modulo">
              <tr className="border-b border-linha text-left">
                <th scope="col" className="rotulo px-3 py-1.5">
                  Medida em
                </th>
                <th scope="col" className="rotulo px-3 py-1.5 text-right">
                  Amostras
                </th>
                <th scope="col" className="rotulo px-3 py-1.5">
                  Saturação
                </th>
                <th scope="col" className="rotulo px-3 py-1.5">
                  Modo
                </th>
                <th scope="col" className="rotulo px-3 py-1.5 text-right">
                  Recebido − medido
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((j) => {
                const f = fracao(j.amostras, j.amostras_esperadas)
                return (
                  <tr key={j.id} className="border-b border-linha last:border-b-0">
                    <td className="valor px-3 py-1.5 whitespace-nowrap">
                      {formatarHora(j.medido_em)}
                    </td>
                    <td className="valor px-3 py-1.5 text-right">
                      {f === null ? TRACO : formatarPercentual(f, 1)}
                      {f !== null && f < 0.98 ? (
                        <span className="ml-1 border border-dashed border-texto px-1 text-12">
                          baixa
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">{j.saturou ? 'saturou' : 'não'}</td>
                    <td className="px-3 py-1.5">
                      {j.modo === 'rapido' ? 'rápido 1 s' : 'normal 5 s'}
                    </td>
                    <td className="valor px-3 py-1.5 text-right whitespace-nowrap">
                      {formatarNumero(atrasoS(j), 1)} s
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-linha px-3 py-1.5 text-12 text-apoio">
        Recebido − medido: quanto depois de medir a API recebeu a janela. Inclui a duração da janela
        quando o dispositivo marca o início dela, e depende do acerto dos dois relógios.
      </p>
    </Modulo>
  )
}

function AtalhoEnsaios({ maquinaId }: { maquinaId: number }) {
  return (
    <Modulo rotulo="Ensaios" className="xl:col-span-5">
      <div className="flex flex-col items-start gap-2">
        <p className="text-13 text-apoio">
          Gravações rotuladas da coleta: receita, eventos, correções, replay e descarte.
        </p>
        <Link
          to="/coleta/ensaios"
          search={{ maquina: maquinaId }}
          className={buttonVariants({ variant: 'outline' })}
        >
          Ensaios gravados <ArrowRight aria-hidden="true" strokeWidth={1.5} />
        </Link>
      </div>
    </Modulo>
  )
}

function Sobre() {
  return (
    <Modulo rotulo="Sobre" className="xl:col-span-7">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-13">
        <dt className="text-apoio">Versão do painel</dt>
        <dd className="valor text-texto">{__VERSAO_DO_PAINEL__}</dd>
        <dt className="text-apoio">Commit do build</dt>
        <dd className="valor text-texto">{__COMMIT_DO_BUILD__}</dd>
        <dt className="text-apoio">API em uso</dt>
        <dd className="valor [overflow-wrap:anywhere] text-texto">{URL_API}</dd>
      </dl>
    </Modulo>
  )
}

const ROTULO_CATALOGO: Record<TipoCatalogo, string> = {
  materiais: 'Materiais',
  ferramentas: 'Ferramentas',
}

function Catalogo({ tipo, admin }: { tipo: TipoCatalogo; admin: boolean }) {
  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const idBusca = useId()
  const itens = useQuery(consultaCatalogo(tipo, busca, mostrarInativos ? null : true))
  const lista = itens.data?.conteudo ?? []
  const parecidos = paresParecidos(lista.filter((i) => i.ativo))
  return (
    <Modulo
      rotulo={ROTULO_CATALOGO[tipo]}
      detalhe={itens.data ? `${formatarNumero(itens.data.total_elementos)} itens` : undefined}
      semRecuo
    >
      <div className="flex flex-wrap items-end gap-3 border-b border-linha px-3 py-2">
        <label htmlFor={idBusca} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="rotulo">Buscar</span>
          <span className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-apoio"
              strokeWidth={1.5}
            />
            <Input
              id={idBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="parte do nome"
              className="min-h-11 pl-8"
            />
          </span>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-13 text-texto">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.target.checked)}
            className="size-5"
          />
          mostrar desativados
        </label>
      </div>
      {parecidos.length > 0 ? (
        <div
          role="note"
          className="flex flex-col gap-1 border-b border-dashed border-texto px-3 py-2 text-13 text-texto"
        >
          <span className="font-medium">Estes itens parecem o mesmo:</span>
          {parecidos.slice(0, 5).map(([a, b]) => (
            <span key={`${a.id}-${b.id}`}>
              “{a.nome}” e “{b.nome}”
              {admin ? ' — renomeie ou desative um deles.' : ' — avise um administrador.'}
            </span>
          ))}
        </div>
      ) : null}
      {itens.isPending ? (
        <EstadoCarregando />
      ) : itens.isError ? (
        <EstadoErro erro={itens.error} />
      ) : lista.length === 0 ? (
        <EstadoVazio titulo={busca ? 'Nada com esse nome.' : 'Catálogo vazio.'}>
          {busca ? null : 'Os itens nascem na receita da Coleta, com confirmação.'}
        </EstadoVazio>
      ) : (
        <ul className="max-h-[28rem] overflow-y-auto" data-testid={`catalogo-${tipo}`}>
          {lista.map((item) => (
            <ItemDoCatalogo key={item.id} tipo={tipo} item={item} admin={admin} />
          ))}
        </ul>
      )}
    </Modulo>
  )
}

function ItemDoCatalogo({
  tipo,
  item,
  admin,
}: {
  tipo: TipoCatalogo
  item: ItemCatalogo
  admin: boolean
}) {
  const cliente = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(item.nome)
  const [erro, setErro] = useState<string | null>(null)
  const idCampo = useId()
  const salvar = async () => {
    setErro(null)
    try {
      await renomearItem(tipo, item.id, nome)
      await cliente.invalidateQueries({ queryKey: ['catalogo', tipo] })
      setEditando(false)
      toast('Item renomeado.')
    } catch (e) {
      setErro(mensagemDoErro(e))
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-linha px-3 py-1.5 last:border-b-0">
      {editando ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={idCampo} className="sr-only">
            Novo nome de {item.nome}
          </label>
          <div className="flex gap-2">
            <Input
              id={idCampo}
              value={nome}
              maxLength={80}
              onChange={(e) => setNome(e.target.value)}
              className="min-h-11"
            />
            <Button variant="default" onClick={() => void salvar()}>
              Gravar
            </Button>
            <Button variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
          <MensagemDoCampo id={`${idCampo}-erro`} erro={erro} />
        </div>
      ) : (
        <span
          className={cn(
            'min-w-0 flex-1 [overflow-wrap:anywhere] text-15',
            item.ativo ? 'text-texto' : 'text-apoio line-through',
          )}
        >
          {item.nome}
          {item.descricao ? (
            <span className="ml-2 text-12 text-apoio no-underline">{item.descricao}</span>
          ) : null}
          {!item.ativo ? <span className="ml-2 text-12 text-apoio">desativado</span> : null}
        </span>
      )}
      {admin && item.ativo && !editando ? (
        <span className="flex gap-2">
          <Button size="sm" onClick={() => setEditando(true)} aria-label={`Renomear ${item.nome}`}>
            Renomear
          </Button>
          <SegurarParaConfirmar
            aoConfirmar={() => {
              desativarItem(tipo, item.id)
                .then(() => {
                  toast(`“${item.nome}” desativado.`)
                  void cliente.invalidateQueries({ queryKey: ['catalogo', tipo] })
                })
                .catch((e: unknown) => toast(mensagemDoErro(e)))
            }}
          >
            Segure para desativar
          </SegurarParaConfirmar>
        </span>
      ) : null}
    </li>
  )
}

const PAPEIS: Papel[] = ['OPERADOR', 'TECNICO', 'ADMIN']

/** Espelha a validação da API (NovoUsuarioRequisicao). */
const esquemaUsuario = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(120, 'No máximo 120 caracteres.'),
  email: z.email('E-mail inválido.').max(160, 'No máximo 160 caracteres.'),
  senha: z
    .string()
    .min(8, 'A senha precisa de pelo menos 8 caracteres.')
    .max(72, 'No máximo 72 caracteres.'),
  papel: z.enum(['ADMIN', 'TECNICO', 'OPERADOR']),
})

function Usuarios() {
  const cliente = useQueryClient()
  const sessao = useSessao()
  const meuId = sessao.fase === 'autenticada' ? sessao.usuario.id : null
  const usuarios = useQuery(consultaUsuarios())
  const [form, setForm] = useState({ nome: '', email: '', senha: '', papel: 'OPERADOR' as Papel })
  const [erros, setErros] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const ids = { nome: useId(), email: useId(), senha: useId(), papel: useId() }

  const criar = async () => {
    setFalha(null)
    const r = esquemaUsuario.safeParse(form)
    if (!r.success) {
      const novos: typeof erros = {}
      for (const p of r.error.issues) {
        const campo = p.path[0] as keyof typeof form
        novos[campo] ??= p.message
      }
      setErros(novos)
      return
    }
    setErros({})
    setEnviando(true)
    try {
      await criarUsuario(r.data)
      await cliente.invalidateQueries({ queryKey: ['usuarios'] })
      setForm({ nome: '', email: '', senha: '', papel: 'OPERADOR' })
      toast('Usuário criado.')
    } catch (e) {
      if (e instanceof ErroApi && e.status === 409) setErros({ email: e.message })
      else if (e instanceof ErroApi && e.campos.length > 0) {
        const novos: typeof erros = {}
        e.campos.forEach((c) => {
          if (c.campo in form) novos[c.campo as keyof typeof form] = c.mensagem
        })
        setErros(novos)
      } else setFalha(mensagemDoErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Painel className="xl:grid-cols-12">
      <Modulo rotulo="Usuários" className="xl:col-span-8" semRecuo>
        {usuarios.isPending ? (
          <EstadoCarregando />
        ) : usuarios.isError ? (
          <EstadoErro erro={usuarios.error} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-13" data-testid="tabela-usuarios">
              <thead>
                <tr className="border-b border-linha text-left">
                  <th scope="col" className="rotulo px-3 py-1.5">
                    Nome
                  </th>
                  <th scope="col" className="rotulo px-3 py-1.5">
                    E-mail
                  </th>
                  <th scope="col" className="rotulo px-3 py-1.5">
                    Papel
                  </th>
                  <th scope="col" className="rotulo px-3 py-1.5">
                    Situação
                  </th>
                  <th scope="col" className="px-3 py-1.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usuarios.data.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-linha last:border-b-0"
                    data-usuario={u.email}
                  >
                    <td className="max-w-56 px-3 py-1.5 [overflow-wrap:anywhere] text-texto">
                      {u.nome}
                    </td>
                    <td className="valor max-w-64 px-3 py-1.5 [overflow-wrap:anywhere]">
                      {u.email}
                    </td>
                    <td className="px-3 py-1.5">{ROTULO_PAPEL_USUARIO[u.papel]}</td>
                    <td className="px-3 py-1.5">{u.ativo ? 'ativo' : 'desativado'}</td>
                    <td className="px-3 py-1.5 text-right">
                      {u.ativo && u.id !== meuId ? (
                        <SegurarParaConfirmar
                          aoConfirmar={() => {
                            desativarUsuario(u.id)
                              .then(() => {
                                toast(`${u.nome} desativado.`)
                                void cliente.invalidateQueries({ queryKey: ['usuarios'] })
                              })
                              .catch((e: unknown) => toast(mensagemDoErro(e)))
                          }}
                        >
                          Segure para desativar
                        </SegurarParaConfirmar>
                      ) : u.id === meuId ? (
                        <span className="text-12 text-apoio">você</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modulo>
      <Modulo rotulo="Novo usuário" className="xl:col-span-4">
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void criar()
          }}
        >
          <CampoTexto
            id={ids.nome}
            rotulo="Nome"
            valor={form.nome}
            erro={erros.nome}
            autoComplete="off"
            aoMudar={(nome) => setForm({ ...form, nome })}
          />
          <CampoTexto
            id={ids.email}
            rotulo="E-mail"
            tipo="email"
            valor={form.email}
            erro={erros.email}
            autoComplete="off"
            aoMudar={(email) => setForm({ ...form, email })}
          />
          <CampoTexto
            id={ids.senha}
            rotulo="Senha (mínimo 8 caracteres)"
            tipo="password"
            valor={form.senha}
            erro={erros.senha}
            autoComplete="new-password"
            aoMudar={(senha) => setForm({ ...form, senha })}
          />
          <label htmlFor={ids.papel} className="flex flex-col gap-1">
            <span className="rotulo">Papel</span>
            <select
              id={ids.papel}
              value={form.papel}
              onChange={(e) => setForm({ ...form, papel: e.target.value as Papel })}
              className="min-h-11 rounded-2 border border-linha-forte bg-rebaixo px-2 text-15"
            >
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PAPEL_USUARIO[p]}
                </option>
              ))}
            </select>
          </label>
          <MensagemDoCampo id={`${ids.nome}-falha`} erro={falha} />
          <Button type="submit" variant="default" disabled={enviando} className="self-start">
            {enviando ? 'Criando…' : 'Criar usuário'}
          </Button>
        </form>
      </Modulo>
    </Painel>
  )
}

function CampoTexto({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  tipo = 'text',
  autoComplete,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  erro?: string
  tipo?: string
  autoComplete?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <Input
        id={id}
        type={tipo}
        value={valor}
        autoComplete={autoComplete}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className="min-h-11"
      />
      <MensagemDoCampo id={`${id}-erro`} erro={erro} />
    </div>
  )
}

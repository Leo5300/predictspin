import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  ativarModelo,
  chavesModelos,
  consultaModelo,
  consultaModelos,
  consultaTrabalhos,
  treinar,
  type MetadadosModelo,
  type ModeloResumo,
  type ValidacaoModelo,
} from '@/api/adaptadores/modelos'
import { consultaMaquinas } from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Button } from '@/componentes/ui/button'
import { Explica } from '@/componentes/ui/explica'
import { formatarDataHora } from '@/dominio/formato'
import {
  emAndamento,
  intensidades,
  nomeDaCaracteristica,
  nomeDaClasse,
  porcento,
  ROTULO_ESTADO_TRABALHO,
  decimal2,
} from '@/dominio/modelos'
import { useFonte } from '@/estado/preferencias'
import { useModelosAoVivo } from '@/hooks/useModelosAoVivo'

const AVISO_SIMULADO = 'dado simulado: não é resultado'

/**
 * Modelos de segunda opinião: Treinar (ADMIN e TECNICO, com o progresso ao vivo), versões, métricas da validação e
 * Ativar (só ADMIN, com a comparação com a versão ativa). OPERADOR só vê. Métricas em um tom só, sem verde ou
 * vermelho para "bom" ou "ruim"; modelo de dado simulado leva "dado simulado: não é resultado".
 */
export function TelaModelos() {
  const simulado = useFonte() === 'simulado'
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const podeTreinar = papel === 'ADMIN' || papel === 'TECNICO'
  const maquinas = useQuery(consultaMaquinas())
  const maquinaId = maquinas.data?.conteudo[0]?.id
  useModelosAoVivo(maquinaId, simulado)
  const cliente = useQueryClient()
  const modelos = useQuery({
    ...consultaModelos(maquinaId ?? 0, simulado),
    enabled: maquinaId !== undefined,
  })
  const trabalhos = useQuery({
    ...consultaTrabalhos(maquinaId ?? 0, simulado),
    enabled: maquinaId !== undefined,
  })
  const [escolhido, setEscolhido] = useState<number | null>(null)

  useEffect(() => {
    document.title = 'Modelos · PredictSpin'
  }, [])

  const versoes = modelos.data?.conteudo ?? []
  const ativo = versoes.find((m) => m.estado === 'ativo')
  const idDetalhe = escolhido ?? versoes[0]?.id ?? null
  const trabalho = trabalhos.data?.conteudo[0]

  const refazer = () => {
    if (maquinaId === undefined) return
    void cliente.invalidateQueries({ queryKey: chavesModelos.trabalhos(maquinaId, simulado) })
    void cliente.invalidateQueries({ queryKey: chavesModelos.modelos(maquinaId, simulado) })
  }
  const botaoTreinar = useMutation({
    mutationFn: () => treinar(maquinaId ?? 0, simulado),
    onSuccess: refazer,
    onError: (e) => toast(mensagemDoErro(e)),
  })

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-24 font-semibold">Modelos</h1>
        <Explica chave="modelo" />
        {simulado ? <SeloSim /> : null}
      </header>
      <p className="max-w-prose text-13 text-apoio">
        Segunda opinião: quem acende atenção e alarme continua sendo a comparação com o normal. O
        modelo só acrescenta a classe provável, a confiança e o escore de anomalia.
      </p>
      <Painel className="lg:grid-cols-[2fr_3fr]">
        <div className="grid gap-px bg-linha">
          <Modulo
            rotulo="Treino"
            simulado={simulado}
            acoes={
              podeTreinar ? (
                <Button
                  variant="default"
                  disabled={
                    maquinaId === undefined ||
                    botaoTreinar.isPending ||
                    (trabalho ? emAndamento(trabalho.estado) : false)
                  }
                  onClick={() => botaoTreinar.mutate()}
                >
                  Treinar
                </Button>
              ) : null
            }
          >
            {trabalhos.isPending ? (
              <EstadoCarregando />
            ) : !trabalho ? (
              <p className="text-13 text-apoio">
                Nenhum treino ainda. O treino usa só janelas rotuladas: ensaios encerrados e o
                retorno do técnico nas OS.
              </p>
            ) : (
              <div className="flex flex-col gap-1 text-13" aria-live="polite">
                <p>
                  <span className="text-apoio">Trabalho {trabalho.id}: </span>
                  <span className="font-medium">
                    {ROTULO_ESTADO_TRABALHO[trabalho.estado] ?? trabalho.estado}
                  </span>
                </p>
                {trabalho.mensagem ? (
                  <p className="text-apoio [overflow-wrap:anywhere]">{trabalho.mensagem}</p>
                ) : null}
                {trabalho.comando ? (
                  <pre className="valor overflow-x-auto border border-linha bg-fundo p-2 text-12 whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {trabalho.comando}
                  </pre>
                ) : null}
                <p className="text-12 text-apoio">
                  Criado {formatarDataHora(trabalho.criado_em)}
                  {trabalho.criado_por ? ` por ${trabalho.criado_por}` : ''}
                  {trabalho.modelo_versao ? ` · gerou a versão ${trabalho.modelo_versao}` : ''}
                </p>
              </div>
            )}
          </Modulo>
          <Modulo rotulo="Versões" explica="versao_ativa" semRecuo simulado={simulado}>
            {modelos.isPending ? (
              <EstadoCarregando />
            ) : modelos.isError ? (
              <EstadoErro erro={modelos.error} />
            ) : versoes.length === 0 ? (
              <EstadoVazio titulo="Nenhuma versão treinada.">
                Grave ensaios rotulados (normal e as condições), recalcule a referência e toque em
                Treinar.
              </EstadoVazio>
            ) : (
              <ul aria-label="Versões do modelo">
                {versoes.map((m) => (
                  <LinhaVersao
                    key={m.id}
                    modelo={m}
                    escolhida={m.id === idDetalhe}
                    aoEscolher={() => setEscolhido(m.id)}
                  />
                ))}
              </ul>
            )}
          </Modulo>
        </div>
        {idDetalhe !== null ? (
          <DetalheDaVersao
            id={idDetalhe}
            ativo={ativo}
            podeAtivar={papel === 'ADMIN'}
            aoAtivar={refazer}
          />
        ) : (
          <Modulo rotulo="Detalhe">
            <p className="text-13 text-apoio">Escolha uma versão para ver as métricas.</p>
          </Modulo>
        )}
      </Painel>
    </div>
  )
}

function LinhaVersao({
  modelo,
  escolhida,
  aoEscolher,
}: {
  modelo: ModeloResumo
  escolhida: boolean
  aoEscolher: () => void
}) {
  const porClasse = Object.entries(modelo.conjunto.por_classe)
    .map(([c, n]) => `${nomeDaClasse(c)} ${n}`)
    .join(' · ')
  const porOrigem = Object.entries(modelo.conjunto.por_origem)
    .map(([o, n]) => `${o.replace('_', ' ')} ${n}`)
    .join(' · ')
  return (
    <li className="border-b border-linha last:border-b-0">
      <button
        type="button"
        onClick={aoEscolher}
        aria-pressed={escolhida}
        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-13 aria-pressed:bg-realce [@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">v{modelo.versao}</span>
          <span className={modelo.estado === 'ativo' ? 'rotulo text-texto' : 'rotulo text-apoio'}>
            {modelo.estado === 'ativo'
              ? '● ativa'
              : modelo.estado === 'candidato'
                ? '○ candidata'
                : '– arquivada'}
          </span>
          <span className="text-apoio">{formatarDataHora(modelo.criado_em)}</span>
        </span>
        <span className="text-apoio [overflow-wrap:anywhere]">
          {modelo.conjunto.janelas} janelas: {porClasse}
        </span>
        <span className="text-12 text-apoio [overflow-wrap:anywhere]">origem: {porOrigem}</span>
        {modelo.aviso_simulado ? (
          <span className="text-12 text-apoio">{modelo.aviso_simulado}</span>
        ) : null}
      </button>
    </li>
  )
}

function DetalheDaVersao({
  id,
  ativo,
  podeAtivar,
  aoAtivar,
}: {
  id: number
  ativo: ModeloResumo | undefined
  podeAtivar: boolean
  aoAtivar: () => void
}) {
  const detalhe = useQuery(consultaModelo(id))
  const doAtivo = useQuery({
    ...consultaModelo(ativo?.id ?? 0),
    enabled: ativo !== undefined && ativo.id !== id,
  })
  const [confirmando, setConfirmando] = useState(false)
  const ativar = useMutation({
    mutationFn: () => ativarModelo(id),
    onSuccess: () => {
      setConfirmando(false)
      aoAtivar()
      toast('Versão ativada: as próximas janelas recebem a segunda opinião dela.')
    },
    onError: (e) => toast(mensagemDoErro(e)),
  })
  if (detalhe.isPending)
    return (
      <Modulo rotulo="Detalhe">
        <EstadoCarregando />
      </Modulo>
    )
  if (detalhe.isError)
    return (
      <Modulo rotulo="Detalhe">
        <EstadoErro erro={detalhe.error} />
      </Modulo>
    )
  const { modelo, metadados, avisos } = detalhe.data
  return (
    <Modulo
      rotulo={`Versão ${modelo.versao}`}
      simulado={modelo.simulado}
      detalhe={
        modelo.estado === 'ativo'
          ? 'ativa'
          : modelo.estado === 'candidato'
            ? 'candidata'
            : 'arquivada'
      }
      acoes={
        podeAtivar && modelo.estado !== 'ativo' ? (
          <Button variant="default" onClick={() => setConfirmando(true)}>
            Ativar
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {modelo.simulado ? (
          <p className="border border-linha-forte px-2 py-1 text-13 font-medium">
            {AVISO_SIMULADO}
          </p>
        ) : null}
        {avisos.filter((a) => a !== AVISO_SIMULADO).length > 0 ? (
          <ul className="list-disc pl-5 text-13 text-apoio">
            {avisos
              .filter((a) => a !== AVISO_SIMULADO)
              .map((a) => (
                <li key={a}>{a}</li>
              ))}
          </ul>
        ) : null}
        {confirmando ? (
          <Comparacao
            candidata={metadados}
            ativa={doAtivo.data?.metadados}
            versaoAtiva={ativo?.versao}
            aoConfirmar={() => ativar.mutate()}
            aoCancelar={() => setConfirmando(false)}
            ocupado={ativar.isPending}
          />
        ) : null}
        <p className="text-13 text-apoio">
          Limite de anomalia {decimal2(metadados.limiar_anomalia)} (percentil{' '}
          {metadados.metricas.if_percentil} do escore nas janelas normais) ·{' '}
          {metadados.caracteristicas.length} características · referência v
          {metadados.referencia_numero ?? '—'} · criada por{' '}
          {modelo.criado_por ?? 'serviço de treino'}
        </p>
        <Validacao titulo="Validação por ensaio" explica v={metadados.metricas.por_ensaio} />
        <Validacao titulo="Validação por dia" v={metadados.metricas.por_dia} />
        <Importancia itens={metadados.importancia} />
        {metadados.classes_fora.length > 0 ? (
          <p className="text-13 text-apoio">
            Fora do classificador (poucos ensaios):{' '}
            {metadados.classes_fora
              .map((c) => `${nomeDaClasse(c.classe)} (${c.ensaios})`)
              .join(', ')}
          </p>
        ) : null}
      </div>
    </Modulo>
  )
}

function Validacao({
  titulo,
  v,
  explica = false,
}: {
  titulo: string
  v: ValidacaoModelo
  explica?: boolean
}) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <h3 className="rotulo flex items-center gap-1">
        {titulo}
        {explica ? <Explica chave="validacao_ensaio" /> : null}
      </h3>
      {!v.aplicavel ? (
        <p className="text-13 text-apoio">{v.motivo ?? 'não aplicável'}</p>
      ) : (
        <>
          {v.classificador ? (
            <>
              <p className="text-13">
                F1 macro{' '}
                <span className="valor font-semibold">{decimal2(v.classificador.f1_macro)}</span>
                <span className="text-apoio">
                  {' '}
                  · {v.classificador.janelas} janelas testadas{v.k ? ` · ${v.k} partes` : ''}
                  {v.dias ? ` · ${v.dias} dias` : ''}
                </span>
              </p>
              <MatrizConfusao
                classes={v.classificador.classes}
                matriz={v.classificador.matriz_confusao}
              />
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-13">
                <span className="flex items-center gap-1 text-apoio">
                  Recall <Explica chave="recall" />
                </span>
                {v.classificador.classes.map((c) => (
                  <span key={c}>
                    {nomeDaClasse(c)}{' '}
                    <span className="valor">{porcento(v.classificador?.recall[c])}</span>
                  </span>
                ))}
              </p>
            </>
          ) : (
            <p className="text-13 text-apoio">
              Sem classificador (menos de 2 classes com ensaios suficientes).
            </p>
          )}
          {v.comparacao ? (
            <table className="w-full max-w-md text-13">
              <caption className="text-left text-apoio">
                Regra × modelo nas mesmas janelas de validação
              </caption>
              <thead>
                <tr className="text-left text-apoio">
                  <th className="font-normal" />
                  <th className="font-normal">Alarma no normal</th>
                  <th className="font-normal">Detecta o não normal</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="text-left font-normal">Regra (z, sem atraso)</th>
                  <td className="valor">{porcento(v.comparacao.regra.falso_positivo, 1)}</td>
                  <td className="valor">{porcento(v.comparacao.regra.deteccao, 1)}</td>
                </tr>
                <tr>
                  <th className="text-left font-normal">Isolation Forest</th>
                  <td className="valor">
                    {porcento(v.comparacao.isolation_forest.falso_positivo, 1)}
                  </td>
                  <td className="valor">{porcento(v.comparacao.isolation_forest.deteccao, 1)}</td>
                </tr>
              </tbody>
            </table>
          ) : null}
        </>
      )}
    </section>
  )
}

/** Tabela com os números; a intensidade (um tom só) é a fração da linha. */
function MatrizConfusao({ classes, matriz }: { classes: string[]; matriz: number[][] }) {
  const tons = intensidades(matriz)
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1 text-13 text-apoio">
        Matriz de confusão (linha: real; coluna: respondido) <Explica chave="matriz_confusao" />
      </p>
      <p className="text-12 text-apoio md:hidden">
        A tabela continua à direita: arraste para o lado.
      </p>
      <div className="overflow-x-auto">
        <table className="text-12" aria-label="Matriz de confusão">
          <thead>
            <tr>
              <th className="font-normal" />
              {classes.map((c) => (
                <th key={c} scope="col" className="px-1 font-normal text-apoio">
                  {nomeDaClasse(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matriz.map((linha, i) => (
              <tr key={classes[i]}>
                <th scope="row" className="pr-2 text-left font-normal text-apoio">
                  {nomeDaClasse(classes[i])}
                </th>
                {linha.map((n, j) => (
                  <td
                    key={classes[j]}
                    className="valor min-w-12 border border-linha px-1 text-center"
                    // texto sempre na cor normal e fundo no máximo 25% do tom do texto: contraste AA nos dois temas
                    style={{
                      background: `color-mix(in oklab, var(--color-texto) ${Math.round((tons[i]?.[j] ?? 0) * 25)}%, transparent)`,
                    }}
                  >
                    {n}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Importancia({ itens }: { itens: MetadadosModelo['importancia'] }) {
  const maior = Math.max(...itens.map((i) => i.valor), 1e-9)
  return (
    <section aria-label="Importância das características" className="flex flex-col gap-1">
      <h3 className="rotulo">Importância (top 10, por permutação)</h3>
      <ul className="flex flex-col gap-0.5 text-12">
        {itens.map((i) => (
          <li key={i.nome} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2">
            <span className="truncate" title={i.nome}>
              {nomeDaCaracteristica(i.nome)}
            </span>
            <span className="h-2 bg-linha">
              <span
                className="block h-2 bg-texto"
                style={{ width: `${(i.valor / maior) * 100}%` }}
              />
            </span>
            <span className="valor text-right text-apoio">
              {i.valor.toFixed(3).replace('.', ',')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Comparacao({
  candidata,
  ativa,
  versaoAtiva,
  aoConfirmar,
  aoCancelar,
  ocupado,
}: {
  candidata: MetadadosModelo
  ativa: MetadadosModelo | undefined
  versaoAtiva: number | undefined
  aoConfirmar: () => void
  aoCancelar: () => void
  ocupado: boolean
}) {
  const linha = (m: MetadadosModelo | undefined) => ({
    f1: m?.metricas.por_ensaio.classificador?.f1_macro,
    fp: m?.metricas.por_ensaio.comparacao?.isolation_forest.falso_positivo,
    det: m?.metricas.por_ensaio.comparacao?.isolation_forest.deteccao,
    janelas: m?.conjunto.janelas,
  })
  const a = linha(ativa)
  const c = linha(candidata)
  return (
    <div
      role="group"
      aria-label="Comparação com a versão ativa"
      className="flex flex-col gap-2 border border-linha-forte p-2"
    >
      <p className="text-13 font-medium">
        {versaoAtiva
          ? `Comparação com a versão ativa (v${versaoAtiva})`
          : 'Nenhuma versão ativa ainda'}
      </p>
      <table className="w-full max-w-md text-13">
        <thead>
          <tr className="text-left text-apoio">
            <th className="font-normal" />
            <th className="font-normal">Ativa</th>
            <th className="font-normal">Esta</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="text-left font-normal">F1 macro por ensaio</th>
            <td className="valor">{decimal2(a.f1)}</td>
            <td className="valor">{decimal2(c.f1)}</td>
          </tr>
          <tr>
            <th className="text-left font-normal">IF: alarma no normal</th>
            <td className="valor">{porcento(a.fp, 1)}</td>
            <td className="valor">{porcento(c.fp, 1)}</td>
          </tr>
          <tr>
            <th className="text-left font-normal">IF: detecta o não normal</th>
            <td className="valor">{porcento(a.det, 1)}</td>
            <td className="valor">{porcento(c.det, 1)}</td>
          </tr>
          <tr>
            <th className="text-left font-normal">Janelas do treino</th>
            <td className="valor">{a.janelas ?? '—'}</td>
            <td className="valor">{c.janelas ?? '—'}</td>
          </tr>
        </tbody>
      </table>
      <div className="flex gap-2">
        <Button variant="default" onClick={aoConfirmar} disabled={ocupado}>
          Confirmar ativação
        </Button>
        <Button onClick={aoCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}

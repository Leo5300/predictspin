import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import Animated, { FadeIn, ReduceMotion, ZoomIn } from 'react-native-reanimated'

import {
  abrirEnsaio,
  chaves,
  consultaCatalogo,
  consultaCobertura,
  consultaEnsaioAberto,
  consultaJanelasEnsaio,
  consultaResumoEnsaio,
  descartarEnsaio,
  encerrarEnsaio,
  marcarEvento,
} from '@/api/consultas'
import { CONDICOES_DE_ENSAIO, ETAPAS, MOTIVOS_DE_EVENTO } from '@/api/enumeracoes'
import { mensagemDoErro } from '@/api/erros'
import type { Ensaio, ItemCatalogo } from '@/api/tipos'
import { ALVO_DE_TOQUE, Botao, Carregando, Escolha, Mensagem, Modulo } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { Hachura, SeloSim } from '@/componentes/Hachura'
import { SegurarParaConfirmar } from '@/componentes/SegurarParaConfirmar'
import { Texto } from '@/componentes/Texto'
import {
  avisosDoPreVoo,
  chaveDaCelula,
  condicoesDaEtapa,
  fita,
  formatarCronometro,
  gradeDeCobertura,
  nomeDe,
  porQueNaoGrava,
  preVoo,
  proximaSugerida,
  rotacaoDaEtapa,
  ROTULO_CONDICAO,
  ROTULO_ETAPA,
  ROTULO_MOTIVO,
  type Celula,
  type ItemDoPreVoo,
} from '@/dominio/coleta'
import { avisar } from '@/estado/avisos'
import { useFonte } from '@/estado/preferencias'
import { useAgoraParede, useConexao, useCores } from '@/hooks/basicos'
import { useUltimaJanela } from '@/hooks/useDadosDaMaquina'
import { useMaquinaAtual } from '@/hooks/useMaquinaAtual'

const PONTOS = ['A', 'B', 'C'] as const
const MARCA_DO_ITEM: Record<ItemDoPreVoo['estado'], string> = { ok: '✓', aviso: '▲', bloqueia: '✕' }

/** Lista de escolha única em linhas (condição, material, ferramenta), com alvo de toque grande. */
function Lista<T extends string | number>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  testID,
}: {
  rotulo: string
  valor: T | null
  opcoes: { valor: T; rotulo: string }[]
  aoMudar: (v: T) => void
  testID: string
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={rotulo}>
      {opcoes.map((o) => {
        const marcado = o.valor === valor
        return (
          <Pressable
            key={String(o.valor)}
            onPress={() => aoMudar(o.valor)}
            accessibilityRole="radio"
            accessibilityState={{ checked: marcado }}
            accessibilityLabel={o.rotulo}
            className={`justify-center border-b px-3 ${marcado ? 'border-linha-forte bg-rebaixo' : 'border-linha bg-modulo'}`}
            style={{ minHeight: ALVO_DE_TOQUE }}
            testID={`${testID}-${o.valor}`}
          >
            <Texto peso={marcado ? 'forte' : 'normal'}>
              {marcado ? '● ' : '○ '}
              {o.rotulo}
            </Texto>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Pré-voo: uma linha por item, que aparece em sequência a cada janela nova. */
export function PreVoo({ itens, janelaId }: { itens: ItemDoPreVoo[]; janelaId: number | null }) {
  return (
    <View testID="pre-voo">
      {itens.map((item, i) => (
        <Animated.View
          key={`${item.chave}-${janelaId ?? 'sem'}`}
          entering={FadeIn.delay(i * 120)
            .duration(180)
            .reduceMotion(ReduceMotion.System)}
          className="flex-row gap-3 border-b border-linha py-2"
          accessible
          accessibilityLabel={`${item.rotulo}: ${item.estado === 'ok' ? 'ok' : item.estado === 'aviso' ? 'aviso' : 'bloqueia'}, ${item.detalhe}. ${item.oQueFazer ?? ''}`}
          testID={`pre-voo-${item.chave}`}
        >
          <Texto
            familia="mono"
            peso="forte"
            tom={item.estado === 'ok' ? 'texto' : item.estado === 'aviso' ? 'atencao' : 'apoio'}
            className="w-5"
          >
            {MARCA_DO_ITEM[item.estado]}
          </Texto>
          <View className="flex-1">
            <Texto peso="medio">
              {item.rotulo} · <Texto tom="apoio">{item.detalhe}</Texto>
            </Texto>
            {item.oQueFazer ? (
              <Texto tamanho="13" tom="apoio">
                {item.oQueFazer}
              </Texto>
            ) : null}
          </View>
        </Animated.View>
      ))}
    </View>
  )
}

/** O botão REC: o único círculo grande da tela; desligado, diz por quê logo abaixo. */
export function BotaoRec({
  aoGravar,
  motivo,
  ocupado,
}: {
  aoGravar: () => void
  motivo: string | null
  ocupado: boolean
}) {
  const cores = useCores()
  const inativo = motivo !== null || ocupado
  return (
    <View className="items-center gap-2 py-4">
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
          aoGravar()
        }}
        disabled={inativo}
        accessibilityRole="button"
        accessibilityLabel="Gravar ensaio"
        accessibilityState={{ disabled: inativo, busy: ocupado }}
        accessibilityHint={motivo ?? 'Abre o ensaio na API e começa a gravar'}
        className="items-center justify-center rounded-full border-4"
        style={{
          width: 120,
          height: 120,
          borderColor: inativo ? cores.linhaForte : cores.rec,
          borderStyle: inativo ? 'dashed' : 'solid',
          backgroundColor: inativo ? cores.rebaixo : cores.modulo,
        }}
        testID="botao-rec"
      >
        <View
          className="rounded-full"
          style={{ width: 56, height: 56, backgroundColor: inativo ? cores.fraco : cores.rec }}
        />
        <Texto peso="forte" tamanho="13" className="mt-1" tom={inativo ? 'fraco' : 'texto'}>
          {ocupado ? 'ABRINDO…' : 'REC'}
        </Texto>
      </Pressable>
      {motivo ? (
        <Texto tamanho="13" tom="apoio" className="text-center" testID="motivo-sem-rec">
          {motivo}
        </Texto>
      ) : null}
    </View>
  )
}

/** Grade de cobertura: válidos / meta por célula; a célula do ensaio que acabou de encerrar carimba. */
export function Cobertura({ grade, carimbo }: { grade: Celula[]; carimbo: string | null }) {
  const porLinha = new Map<string, Celula[]>()
  for (const c of grade) {
    const chave = `${c.etapa} · ${nomeDe(ROTULO_CONDICAO, c.condicao)}`
    porLinha.set(chave, [...(porLinha.get(chave) ?? []), c])
  }
  return (
    <View testID="cobertura">
      {[...porLinha.entries()].map(([linha, celulas]) => (
        <View key={linha} className="flex-row flex-wrap items-center gap-2 border-b border-linha py-2">
          <Texto tamanho="13" className="w-44">
            {linha}
          </Texto>
          {celulas.map((c) => {
            const completa = c.faltam === 0
            const carimbada = carimbo === chaveDaCelula(c)
            return (
              <View
                key={chaveDaCelula(c)}
                className={`border px-2 py-1 ${completa ? 'border-linha-forte bg-rebaixo' : 'border-linha'}`}
                accessible
                accessibilityLabel={`${linha}, ${c.rotacao} rpm: ${c.validos} de ${c.meta}${c.uso === 'validacao' ? ', só validação' : ''}`}
                testID={`celula-${chaveDaCelula(c)}`}
              >
                <Texto tamanho="12" familia="mono" peso={completa ? 'forte' : 'normal'}>
                  {c.rotacao} · {c.validos}/{c.meta}
                </Texto>
                {carimbada ? (
                  <Animated.View
                    entering={ZoomIn.duration(220).reduceMotion(ReduceMotion.System)}
                    className="absolute -top-2 -right-2 border border-linha-forte bg-modulo px-1"
                    testID="carimbo"
                  >
                    <Texto tamanho="12" familia="mono" peso="forte">
                      +1
                    </Texto>
                  </Animated.View>
                ) : null}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

/** Escolha de item do catálogo da API (opcional): "nenhum" ou um item ativo. */
function Catalogo({
  rotulo,
  itens,
  valor,
  aoMudar,
  testID,
}: {
  rotulo: string
  itens: ItemCatalogo[] | undefined
  valor: number | null
  aoMudar: (id: number | null) => void
  testID: string
}) {
  if (!itens) return <Carregando texto={`Lendo ${rotulo.toLowerCase()}…`} />
  return (
    <Lista<number>
      rotulo={rotulo}
      valor={valor ?? 0}
      aoMudar={(v) => aoMudar(v === 0 ? null : v)}
      opcoes={[{ valor: 0, rotulo: 'Não informar' }, ...itens.map((i) => ({ valor: i.id, rotulo: i.nome }))]}
      testID={testID}
    />
  )
}

type Escolhas = {
  etapa: string
  condicao: string
  rotacao: number | null
  materialId: number | null
  ferramentaId: number | null
  repeticao: number
}

/** Antes de gravar: escolhas do ensaio (começa pela próxima sugerida), pré-voo, REC e cobertura. */
function Preparar({ maquinaId, carimbo }: { maquinaId: number; carimbo: string | null }) {
  const cliente = useQueryClient()
  const simulado = useFonte() === 'simulado'
  const conexao = useConexao()
  const { janela, frescor } = useUltimaJanela(maquinaId, simulado)
  const cobertura = useQuery(consultaCobertura(maquinaId, simulado))
  const materiais = useQuery(consultaCatalogo('materiais'))
  const ferramentas = useQuery(consultaCatalogo('ferramentas'))
  const grade = cobertura.data
    ? gradeDeCobertura(cobertura.data.itens, cobertura.data.rotacoes_rpm, cobertura.data.meta, ETAPAS, CONDICOES_DE_ENSAIO)
    : []
  const sugerida = proximaSugerida(grade)
  const [escolhas, setEscolhas] = useState<Escolhas | null>(null)
  // até a pessoa mexer, as escolhas são a próxima gravação sugerida pela cobertura
  const atual: Escolhas = escolhas ?? {
    etapa: sugerida?.etapa ?? 'T1',
    condicao: sugerida?.condicao ?? 'normal',
    rotacao: sugerida && sugerida.rotacao > 0 ? sugerida.rotacao : (cobertura.data?.rotacoes_rpm[0] ?? null),
    materialId: null,
    ferramentaId: null,
    repeticao: 1,
  }
  const mudar = (parte: Partial<Escolhas>) => {
    const novo = { ...atual, ...parte }
    if (!condicoesDaEtapa(novo.etapa, CONDICOES_DE_ENSAIO).includes(novo.condicao)) novo.condicao = 'normal'
    setEscolhas(novo)
  }
  const rotacaoAlvo = rotacaoDaEtapa(atual.etapa, atual.rotacao ?? 0)
  const itens = preVoo({
    janela: frescor === 'vivo' && janela ? janela : null,
    etapa: atual.etapa,
    rotacaoAlvo,
    pontos: PONTOS,
  })
  const semRotacao = atual.etapa !== 'T0' && atual.rotacao === null
  const motivo =
    porQueNaoGrava(itens, !conexao.podeEscrever) ??
    (semRotacao ? 'Escolha a rotação: a API ainda não tem rotações para esta máquina.' : null)
  const avisos = avisosDoPreVoo(itens)

  const abrir = useMutation({
    mutationFn: () =>
      abrirEnsaio(maquinaId, {
        etapa: atual.etapa as (typeof ETAPAS)[number],
        condicao: atual.condicao as (typeof CONDICOES_DE_ENSAIO)[number],
        rotacao_alvo_rpm: rotacaoAlvo,
        repeticao: atual.repeticao,
        simulado,
        ...(atual.materialId ? { material_id: atual.materialId } : {}),
        ...(atual.ferramentaId ? { ferramenta_id: atual.ferramentaId } : {}),
      }),
    onSuccess: (ensaio) => cliente.setQueryData(chaves.ensaioAberto(maquinaId), ensaio),
    // só um ensaio aberto por máquina: a API recusa com 409 e a mensagem dela aparece
    onError: (erro) => {
      avisar(mensagemDoErro(erro))
      void cliente.invalidateQueries({ queryKey: chaves.ensaioAberto(maquinaId) })
    },
  })

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} testID="coleta-preparar">
      {simulado ? (
        <View className="relative overflow-hidden border-b border-linha px-4 py-2">
          <Hachura />
          <Texto peso="forte">Fonte simulada: o ensaio será marcado como simulado.</Texto>
        </View>
      ) : null}
      <Modulo rotulo="Ensaio">
        {sugerida ? (
          <Texto tamanho="13" tom="apoio" className="mb-2" testID="sugestao">
            Próxima sugerida: {sugerida.etapa} · {nomeDe(ROTULO_CONDICAO, sugerida.condicao)}
            {sugerida.rotacao > 0 ? ` · ${sugerida.rotacao} rpm` : ''} ({sugerida.validos} de {sugerida.meta})
          </Texto>
        ) : null}
        <Texto rotulo>Etapa</Texto>
        <Escolha<string>
          rotulo="Etapa"
          valor={atual.etapa}
          aoMudar={(etapa) => mudar({ etapa })}
          opcoes={ETAPAS.map((e) => ({ valor: e, rotulo: e }))}
        />
        <Texto tamanho="13" tom="apoio" className="mt-1">
          {nomeDe(ROTULO_ETAPA, atual.etapa)}
        </Texto>
        {atual.etapa === 'T3' ? (
          <View className="mt-3 gap-1">
            <Texto rotulo>Condição</Texto>
            <Lista<string>
              rotulo="Condição"
              valor={atual.condicao}
              aoMudar={(condicao) => mudar({ condicao })}
              opcoes={condicoesDaEtapa('T3', CONDICOES_DE_ENSAIO).map((c) => ({
                valor: c,
                rotulo: nomeDe(ROTULO_CONDICAO, c),
              }))}
              testID="condicao"
            />
          </View>
        ) : null}
        {atual.etapa !== 'T0' ? (
          <View className="mt-3 gap-1">
            <Texto rotulo>Rotação (marcha)</Texto>
            {cobertura.data && cobertura.data.rotacoes_rpm.length > 0 ? (
              <Escolha<string>
                rotulo="Rotação"
                valor={String(atual.rotacao ?? '')}
                aoMudar={(r) => mudar({ rotacao: Number(r) })}
                opcoes={cobertura.data.rotacoes_rpm.map((r) => ({ valor: String(r), rotulo: `${r}` }))}
              />
            ) : (
              <Texto tom="apoio">A API não tem rotações para esta máquina.</Texto>
            )}
          </View>
        ) : null}
        <View className="mt-3 flex-row items-center gap-3">
          <Texto rotulo className="flex-1">
            Repetição
          </Texto>
          <Botao
            compacto
            titulo="−"
            rotuloAcessivel="Diminuir repetição"
            desabilitado={atual.repeticao <= 1}
            onPress={() => mudar({ repeticao: atual.repeticao - 1 })}
          />
          <Texto familia="mono" peso="forte" tamanho="18" testID="repeticao">
            {atual.repeticao}
          </Texto>
          <Botao
            compacto
            titulo="+"
            rotuloAcessivel="Aumentar repetição"
            onPress={() => mudar({ repeticao: atual.repeticao + 1 })}
          />
        </View>
      </Modulo>
      {atual.etapa === 'T3' ? (
        <>
          <Modulo rotulo="Material">
            <Catalogo
              rotulo="Material"
              itens={materiais.data}
              valor={atual.materialId}
              aoMudar={(materialId) => mudar({ materialId })}
              testID="material"
            />
          </Modulo>
          <Modulo rotulo="Ferramenta">
            <Catalogo
              rotulo="Ferramenta"
              itens={ferramentas.data}
              valor={atual.ferramentaId}
              aoMudar={(ferramentaId) => mudar({ ferramentaId })}
              testID="ferramenta"
            />
          </Modulo>
        </>
      ) : null}
      <Modulo rotulo="Pré-voo (última janela)">
        <PreVoo itens={itens} janelaId={frescor === 'vivo' ? (janela?.id ?? null) : null} />
        {avisos.length > 0 && motivo === null ? (
          <Texto tamanho="13" tom="apoio" className="mt-2">
            Com aviso em {avisos.join(', ').toLowerCase()}: grave só se for de propósito.
          </Texto>
        ) : null}
      </Modulo>
      <BotaoRec aoGravar={() => abrir.mutate()} motivo={motivo} ocupado={abrir.isPending} />
      <Modulo rotulo="Cobertura (ensaios válidos / meta)">
        {cobertura.isPending ? (
          <Carregando />
        ) : cobertura.isError ? (
          <Texto tom="apoio">{mensagemDoErro(cobertura.error)}</Texto>
        ) : (
          <Cobertura grade={grade} carimbo={carimbo} />
        )}
      </Modulo>
    </ScrollView>
  )
}

/** Cabeçalho da gravação: código, etapa, cronômetro em matriz de pontos e janelas contadas pela API. */
export function QuadroDaGravacao({
  ensaio,
  segundos,
  resumo,
}: {
  ensaio: Ensaio
  segundos: number
  resumo: { janelas: number; janelas_saturadas: number } | null
}) {
  const cores = useCores()
  return (
    <Modulo>
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="h-3 w-3 rounded-full" style={{ backgroundColor: cores.rec }} />
        <Texto peso="forte" style={{ letterSpacing: 0.8 }}>
          GRAVANDO
        </Texto>
        <Texto familia="mono" tom="apoio">
          {ensaio.codigo}
        </Texto>
        {ensaio.simulado ? <SeloSim /> : null}
      </View>
      <Texto tamanho="13" tom="apoio" className="mt-1">
        {ensaio.etapa} · {nomeDe(ROTULO_CONDICAO, ensaio.condicao)}
        {ensaio.rotacao_alvo_rpm > 0 ? ` · ${ensaio.rotacao_alvo_rpm} rpm` : ''} · repetição {ensaio.repeticao}
      </Texto>
      <Texto
        familia="matriz"
        tamanho="72"
        className="mt-2"
        accessibilityLabel={`Gravando há ${formatarCronometro(segundos)}`}
        testID="cronometro"
      >
        {formatarCronometro(segundos)}
      </Texto>
      <Texto familia="mono" tamanho="15" testID="contador-janelas">
        {resumo ? `${resumo.janelas} janelas` : 'contando janelas…'}
        {resumo && resumo.janelas_saturadas > 0 ? ` · ${resumo.janelas_saturadas} saturadas` : ''}
      </Texto>
    </Modulo>
  )
}

/** A fita: uma marca por janela; saturada é mais alta e hachurada. */
export function Fita({ tracos }: { tracos: { id: number; saturou: boolean }[] }) {
  const cores = useCores()
  return (
    <Modulo rotulo="Fita (uma marca por janela)">
      <View
        className="h-12 flex-row items-end gap-0.5"
        accessible
        accessibilityLabel={`${tracos.length} janelas na fita, ${tracos.filter((t) => t.saturou).length} saturadas`}
        testID="fita"
      >
        {tracos.map((t) => (
          <View
            key={t.id}
            className="relative overflow-hidden"
            style={{ width: 5, height: t.saturou ? 44 : 24, backgroundColor: t.saturou ? undefined : cores.texto }}
            testID={t.saturou ? 'traco-saturado' : 'traco'}
          >
            {t.saturou ? <Hachura /> : null}
          </View>
        ))}
      </View>
      <Texto tamanho="12" tom="fraco" className="mt-1">
        Marca alta e hachurada: janela saturada (fica fora do aprendizado).
      </Texto>
    </Modulo>
  )
}

/**
 * Gravando: cronômetro em matriz de pontos, janelas contadas pela API, fita com uma marca por janela
 * (saturada mais alta e hachurada), marcar evento, encerrar e descartar segurando. Tudo vem da API: se o
 * celular bloquear a tela, a gravação segue lá, e ao voltar a tela mostra o estado real.
 */
function Gravando({ ensaio, aoEncerrar }: { ensaio: Ensaio; aoEncerrar: (celula: string) => void }) {
  const cliente = useQueryClient()
  const conexao = useConexao()
  const agora = useAgoraParede(1000)
  const resumo = useQuery(consultaResumoEnsaio(ensaio.id))
  const janelas = useQuery(consultaJanelasEnsaio(ensaio.id))
  const [marcando, setMarcando] = useState<Date | null>(null)
  const segundos = (agora - Date.parse(ensaio.iniciado_em)) / 1000
  const tracos = fita(janelas.data ?? [])

  const depois = () => {
    void cliente.invalidateQueries({ queryKey: chaves.ensaioAberto(ensaio.maquina_id) })
    void cliente.invalidateQueries({ queryKey: ['cobertura', ensaio.maquina_id] })
  }
  const aoErrar = (erro: unknown) => avisar(mensagemDoErro(erro))
  const encerrar = useMutation({
    mutationFn: () => encerrarEnsaio(ensaio.id),
    onSuccess: (e) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
      aoEncerrar(chaveDaCelula({ etapa: e.etapa, condicao: e.condicao, rotacao: e.rotacao_alvo_rpm }))
      cliente.setQueryData(chaves.ensaioAberto(ensaio.maquina_id), null)
      depois()
    },
    onError: aoErrar,
  })
  const descartar = useMutation({
    mutationFn: () => descartarEnsaio(ensaio.id),
    onSuccess: () => {
      cliente.setQueryData(chaves.ensaioAberto(ensaio.maquina_id), null)
      depois()
    },
    onError: aoErrar,
  })
  const marcar = useMutation({
    mutationFn: (p: { motivo: string; quando: Date }) => marcarEvento(ensaio.id, p.motivo, p.quando),
    onSuccess: (_, p) => {
      setMarcando(null)
      avisar(`Evento marcado: ${nomeDe(ROTULO_MOTIVO, p.motivo).toLowerCase()}.`)
    },
    onError: aoErrar,
  })
  const ocupado = encerrar.isPending || descartar.isPending
  const podeEscrever = conexao.podeEscrever && !ocupado

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} testID="coleta-gravando">
      <QuadroDaGravacao ensaio={ensaio} segundos={segundos} resumo={resumo.data ?? null} />
      <Fita tracos={tracos} />
      <Modulo rotulo="Evento fora do plano">
        {marcando ? (
          <View className="gap-2">
            <Texto tamanho="13" tom="apoio">
              O que aconteceu? A hora é a do primeiro toque.
            </Texto>
            <View className="flex-row flex-wrap gap-2">
              {MOTIVOS_DE_EVENTO.map((m) => (
                <View key={m} className="min-w-[45%] flex-1">
                  <Botao
                    titulo={nomeDe(ROTULO_MOTIVO, m)}
                    carregando={marcar.isPending}
                    desabilitado={!conexao.podeEscrever}
                    onPress={() => marcar.mutate({ motivo: m, quando: marcando })}
                    testID={`motivo-${m}`}
                  />
                </View>
              ))}
            </View>
            <Botao titulo="Cancelar" onPress={() => setMarcando(null)} />
          </View>
        ) : (
          <Botao
            titulo="Marcar evento"
            desabilitado={!conexao.podeEscrever}
            dica="Pancada, cavaco ou máquina vizinha: guarda a hora agora"
            onPress={() => setMarcando(new Date())}
            testID="marcar-evento"
          />
        )}
      </Modulo>
      <View className="gap-3 px-4 pt-4">
        <SegurarParaConfirmar
          titulo={encerrar.isPending ? 'Encerrando…' : 'Segure para encerrar'}
          desabilitado={!podeEscrever}
          motivoDesabilitado={!conexao.podeEscrever ? 'Sem conexão com a API.' : 'Aguarde a resposta da API.'}
          aoConfirmar={() => encerrar.mutate()}
          testID="segurar-encerrar"
        />
        <SegurarParaConfirmar
          titulo={descartar.isPending ? 'Descartando…' : 'Segure para descartar'}
          desabilitado={!podeEscrever}
          motivoDesabilitado={!conexao.podeEscrever ? 'Sem conexão com a API.' : 'Aguarde a resposta da API.'}
          aoConfirmar={() => descartar.mutate()}
          testID="segurar-descartar"
        />
        <Texto tamanho="13" tom="apoio">
          Descartar marca o ensaio como inválido (não apaga): ele sai da cobertura e do treino.
        </Texto>
      </View>
    </ScrollView>
  )
}

/** Coleta (ADMIN e TECNICO): o ensaio aberto na máquina, se houver; senão, preparar e gravar. */
export function TelaColeta() {
  const maquina = useMaquinaAtual()
  const aberto = useQuery({ ...consultaEnsaioAberto(maquina?.id ?? 0), enabled: Boolean(maquina), refetchInterval: 10_000 })
  const [carimbo, setCarimbo] = useState<string | null>(null)

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo="Coleta" subtitulo={maquina?.codigo} />
      {!maquina || aberto.isPending ? (
        <Carregando />
      ) : aberto.isError ? (
        <Mensagem
          titulo="Não foi possível saber se há ensaio aberto."
          acao={<Botao titulo="Tentar de novo" onPress={() => void aberto.refetch()} />}
        >
          {mensagemDoErro(aberto.error)}
        </Mensagem>
      ) : aberto.data ? (
        <Gravando ensaio={aberto.data} aoEncerrar={setCarimbo} />
      ) : (
        <Preparar maquinaId={maquina.id} carimbo={carimbo} />
      )}
    </View>
  )
}

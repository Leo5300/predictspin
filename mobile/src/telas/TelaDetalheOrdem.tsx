import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native'

import {
  assumirOrdem,
  chaves,
  concluirOrdem,
  consultaAlarme,
  consultaAvaliacao,
  consultaLimites,
  consultaOrdem,
} from '@/api/consultas'
import { CONDICOES_ENCONTRADAS, RETORNOS_TECNICOS } from '@/api/enumeracoes'
import { mensagemDoErro } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import type { ConclusaoOrdem, OrdemServico, SegundaOpiniao } from '@/api/tipos'
import {
  ALVO_DE_TOQUE,
  Botao,
  Carregando,
  Escolha,
  Mensagem,
  Modulo,
  useCoresDoCampo,
  ValorEmLinha,
} from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { SeloSim } from '@/componentes/Hachura'
import { SegurarParaConfirmar } from '@/componentes/SegurarParaConfirmar'
import { TendenciaDoPonto } from '@/componentes/TendenciaDoPonto'
import { Texto } from '@/componentes/Texto'
import { resumoDaOpiniao, rotuloDaMedida, valorDaMedida } from '@/dominio/alarme'
import { formatarDataHora, formatarNumero, formatarPercentual, formatarZ } from '@/dominio/formato'
import {
  faltaNaConclusao,
  janelaEmVoltaDaAbertura,
  nomeDoValor,
  podeAssumir,
  podeConcluir,
  ROTULO_STATUS_ORDEM,
  type FormularioDeConclusao,
} from '@/dominio/ordens'
import { pode } from '@/dominio/permissoes'
import { avisar } from '@/estado/avisos'
import { useAgoraParede, useConexao } from '@/hooks/basicos'

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <View className="flex-row gap-3 py-1">
      <Texto tamanho="13" tom="apoio" className="w-28">
        {rotulo}
      </Texto>
      <Texto tamanho="13" className="flex-1">
        {children}
      </Texto>
    </View>
  )
}

const MOTIVO_DA_ABERTURA: Record<OrdemServico['motivo_abertura'], string> = {
  alarme_continuo: 'alarme contínuo',
  severidade: 'severidade acumulada',
}

function Opiniao({ titulo, opiniao }: { titulo: string; opiniao: SegundaOpiniao }) {
  return (
    <View className="gap-0.5 py-1">
      <Texto tamanho="12" rotulo>
        {titulo}
      </Texto>
      <Texto peso="medio">{resumoDaOpiniao(opiniao, (v) => formatarPercentual(v))}</Texto>
      <Texto tamanho="12" tom="fraco">
        modelo versão {opiniao.versao}
        {opiniao.simulado ? ' · treinado com dado simulado: não é resultado' : ''}
      </Texto>
    </View>
  )
}

/** Alarme que abriu a OS: medida, valor e z, lidos da API; toque abre o detalhe do alarme. */
function AlarmeDeOrigem({ alertaId }: { alertaId: number }) {
  const detalhe = useQuery(consultaAlarme(alertaId))
  const alerta = detalhe.data?.alerta
  return (
    <Modulo rotulo="Alarme de origem">
      {alerta ? (
        <>
          <Linha rotulo="Medida">{rotuloDaMedida(alerta.metrica)}</Linha>
          <Linha rotulo="Valor">
            <ValorEmLinha {...valorDaMedida(alerta)} />
          </Linha>
          {alerta.pior_z !== null ? (
            <Linha rotulo="Pior z">
              <ValorEmLinha valor={formatarZ(alerta.pior_z)} />
            </Linha>
          ) : null}
          <Linha rotulo="Aberto em">{formatarDataHora(alerta.criado_em)}</Linha>
        </>
      ) : detalhe.isError ? (
        <View className="gap-2">
          <Texto tom="apoio">{mensagemDoErro(detalhe.error)}</Texto>
          <Botao titulo="Tentar de novo" onPress={() => void detalhe.refetch()} />
        </View>
      ) : (
        <Carregando texto="Lendo o alarme…" />
      )}
      <View className="pt-2">
        <Botao
          titulo="Abrir o alarme"
          onPress={() => router.push({ pathname: '/alarmes/[alertaId]', params: { alertaId: String(alertaId) } })}
          testID="abrir-alarme-de-origem"
        />
      </View>
    </Modulo>
  )
}

/**
 * Concluir: o retorno (havia problema ou alarme falso) é obrigatório; a condição encontrada e a observação
 * são opcionais. As opções vêm do contrato da API. Segurar para confirmar.
 */
function FormularioDeConclusaoDaOrdem({
  podeEscrever,
  aoConcluir,
  aoCancelar,
}: {
  podeEscrever: boolean
  aoConcluir: (corpo: ConclusaoOrdem) => void
  aoCancelar: () => void
}) {
  const coresDoCampo = useCoresDoCampo()
  const [form, setForm] = useState<FormularioDeConclusao>({ retorno: null, condicao: null, comentario: '' })
  const falta = faltaNaConclusao(form)
  return (
    <View className="gap-4" testID="form-conclusao">
      <Texto tamanho="13" tom="apoio">
        Sua resposta ensina o modelo: com &quot;havia problema&quot; e uma condição, as janelas do alarme entram no
        próximo treino.
      </Texto>
      <View className="gap-1">
        <Texto rotulo>O que você achou</Texto>
        <Escolha<string>
          rotulo="O que você achou"
          valor={form.retorno ?? ''}
          aoMudar={(retorno) => setForm({ ...form, retorno })}
          opcoes={RETORNOS_TECNICOS.map((v) => ({ valor: v, rotulo: nomeDoValor(v) }))}
        />
      </View>
      <View className="gap-1">
        <Texto rotulo>Condição encontrada (opcional)</Texto>
        <View accessibilityRole="radiogroup" accessibilityLabel="Condição encontrada">
          {CONDICOES_ENCONTRADAS.map((c) => {
            const marcado = form.condicao === c
            return (
              <Pressable
                key={c}
                onPress={() => setForm({ ...form, condicao: marcado ? null : c })}
                accessibilityRole="radio"
                accessibilityState={{ checked: marcado }}
                accessibilityLabel={nomeDoValor(c)}
                accessibilityHint={marcado ? 'Toque de novo para desmarcar' : undefined}
                className={`justify-center border-b px-3 ${marcado ? 'border-linha-forte bg-rebaixo' : 'border-linha bg-modulo'}`}
                style={{ minHeight: ALVO_DE_TOQUE }}
                testID={`condicao-${c}`}
              >
                <Texto peso={marcado ? 'forte' : 'normal'}>
                  {marcado ? '● ' : '○ '}
                  {nomeDoValor(c)}
                </Texto>
              </Pressable>
            )
          })}
        </View>
      </View>
      <View className="gap-1">
        <Texto rotulo nativeID="rotulo-observacao">
          Observação (opcional)
        </Texto>
        <TextInput
          {...coresDoCampo}
          accessibilityLabel="Observação"
          accessibilityLabelledBy="rotulo-observacao"
          value={form.comentario}
          onChangeText={(comentario) => setForm({ ...form, comentario })}
          maxLength={500}
          multiline
          placeholder="o que conferiu, o que trocou"
          maxFontSizeMultiplier={1.3}
          className="border border-linha-forte bg-rebaixo px-3 py-2 font-sans text-15 text-texto"
          placeholderTextColorClassName="accent-fraco"
          style={{ minHeight: ALVO_DE_TOQUE }}
          testID="campo-observacao"
        />
      </View>
      <SegurarParaConfirmar
        titulo="Segure para concluir"
        desabilitado={falta !== null || !podeEscrever}
        motivoDesabilitado={!podeEscrever ? 'Sem conexão com a API.' : (falta ?? undefined)}
        aoConfirmar={() => {
          if (!form.retorno) return
          aoConcluir({
            retorno: form.retorno as ConclusaoOrdem['retorno'],
            ...(form.condicao ? { condicao_encontrada: form.condicao as ConclusaoOrdem['condicao_encontrada'] } : {}),
            ...(form.comentario.trim() ? { comentario: form.comentario.trim() } : {}),
          })
        }}
        testID="segurar-concluir"
      />
      <Botao titulo="Cancelar" onPress={aoCancelar} />
    </View>
  )
}

/**
 * Detalhe da OS: status, componente provável, ação recomendada, alarme de origem, tendência do ponto em
 * volta da abertura e a segunda opinião do modelo (na abertura e a mais recente). Assumir com um toque e
 * confirmação; concluir com o formulário e segurando. Depois de cada ação, a tela mostra a resposta da API.
 */
export function TelaDetalheOrdem({ osId }: { osId: number }) {
  const cliente = useQueryClient()
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const conexao = useConexao()
  const detalhe = useQuery(consultaOrdem(osId))
  const [concluindo, setConcluindo] = useState(false)
  const ordem = detalhe.data
  const avaliacao = useQuery({
    ...consultaAvaliacao(ordem?.maquina_id ?? 0, ordem?.simulado ?? false),
    enabled: Boolean(ordem),
  })
  const limites = useQuery(consultaLimites())
  const agora = useAgoraParede(60_000)

  const aplicar = (nova: OrdemServico) => {
    cliente.setQueryData(chaves.ordem(osId), nova)
    void cliente.invalidateQueries({ queryKey: chaves.ordens(nova.simulado) })
  }
  const aoErrar = (erro: unknown) => avisar(mensagemDoErro(erro))
  const assumir = useMutation({ mutationFn: () => assumirOrdem(osId), onSuccess: aplicar, onError: aoErrar })
  const concluir = useMutation({
    mutationFn: (corpo: ConclusaoOrdem) => concluirOrdem(osId, corpo),
    onSuccess: (nova) => {
      setConcluindo(false)
      aplicar(nova)
    },
    onError: aoErrar,
  })

  if (detalhe.isPending) {
    return (
      <View className="flex-1 bg-fundo">
        <Cabecalho titulo="OS" voltar />
        <Carregando />
      </View>
    )
  }
  if (detalhe.isError || !ordem) {
    return (
      <View className="flex-1 bg-fundo">
        <Cabecalho titulo="OS" voltar />
        <Mensagem
          titulo="Não foi possível ler a OS."
          acao={<Botao titulo="Tentar de novo" onPress={() => void detalhe.refetch()} />}
        >
          {mensagemDoErro(detalhe.error)}
        </Mensagem>
      </View>
    )
  }

  const ocupado = assumir.isPending || concluir.isPending
  const podeEscrever = conexao.podeEscrever && !ocupado
  const confirmarAssumir = () =>
    Alert.alert(`Assumir a ${ordem.numero}?`, 'Você fica como responsável por esta OS.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Assumir', onPress: () => assumir.mutate() },
    ])
  const intervalo = janelaEmVoltaDaAbertura(ordem.aberta_em, agora)
  const mostraAcoes = pode(papel, 'assumir_os') || pode(papel, 'concluir_os')

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo={ordem.numero} subtitulo={`${ordem.maquina} · ponto ${ordem.ponto}`} voltar />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} testID="detalhe-os">
        <Modulo>
          <View className="flex-row flex-wrap items-center gap-2">
            <Texto peso="forte" style={{ letterSpacing: 0.8 }} testID="status-os">
              {ROTULO_STATUS_ORDEM[ordem.status]}
            </Texto>
            {ordem.simulado ? <SeloSim /> : null}
          </View>
          <Texto tamanho="18" peso="medio" className="mt-1">
            {ordem.componente ?? 'componente não indicado'}
          </Texto>
          <Texto tamanho="13" tom="apoio" className="mt-1" testID="responsavel-os">
            {ordem.responsavel ? `Assumida por ${ordem.responsavel}` : 'Ninguém assumiu ainda.'}
          </Texto>
        </Modulo>

        <Modulo rotulo="O que conferir primeiro">
          <Texto tamanho="18" peso="medio">
            {ordem.acao_recomendada}
          </Texto>
          {ordem.explicacao ? (
            <Texto tom="apoio" className="mt-2">
              {ordem.explicacao}
            </Texto>
          ) : null}
        </Modulo>

        <Modulo rotulo="Abertura">
          <Linha rotulo="Aberta em">{formatarDataHora(ordem.aberta_em)}</Linha>
          <Linha rotulo="Motivo">{MOTIVO_DA_ABERTURA[ordem.motivo_abertura]}</Linha>
          <Linha rotulo="Severidade">
            <ValorEmLinha valor={formatarNumero(ordem.severidade_acumulada, 0)} unidade="z·s" />
          </Linha>
          {ordem.assumida_em ? <Linha rotulo="Assumida em">{formatarDataHora(ordem.assumida_em)}</Linha> : null}
          {ordem.concluida_em ? <Linha rotulo="Concluída em">{formatarDataHora(ordem.concluida_em)}</Linha> : null}
        </Modulo>

        {ordem.alerta_id !== null ? <AlarmeDeOrigem alertaId={ordem.alerta_id} /> : null}

        <Modulo rotulo="Ponto em volta da abertura">
          <TendenciaDoPonto
            maquinaId={ordem.maquina_id}
            codigo={ordem.ponto}
            simulado={ordem.simulado}
            avaliacao={avaliacao.data}
            limites={limites.data}
            intervalo={intervalo}
            descricaoDoIntervalo="15 minutos antes e depois da abertura"
          />
        </Modulo>

        {ordem.opiniao_abertura || ordem.opiniao_recente ? (
          <Modulo rotulo="Segunda opinião do modelo" testID="segunda-opiniao-os">
            {ordem.opiniao_abertura ? <Opiniao titulo="Na abertura" opiniao={ordem.opiniao_abertura} /> : null}
            {ordem.opiniao_recente ? <Opiniao titulo="Mais recente" opiniao={ordem.opiniao_recente} /> : null}
            <Texto tamanho="13" tom="apoio" className="mt-1">
              Segunda opinião, não muda a OS.
            </Texto>
          </Modulo>
        ) : null}

        {ordem.retorno_tecnico ? (
          <Modulo rotulo="Retorno do técnico">
            <Linha rotulo="Achou">{nomeDoValor(ordem.retorno_tecnico)}</Linha>
            <Linha rotulo="Condição">{nomeDoValor(ordem.condicao_encontrada)}</Linha>
            {ordem.comentario_tecnico ? <Linha rotulo="Observação">{ordem.comentario_tecnico}</Linha> : null}
          </Modulo>
        ) : null}

        <View className="gap-3 px-4 pt-4">
          {podeAssumir(ordem) && pode(papel, 'assumir_os') ? (
            <Botao
              titulo="Assumir"
              variante="acao"
              carregando={assumir.isPending}
              desabilitado={!podeEscrever}
              dica="Pede confirmação e deixa você como responsável"
              onPress={confirmarAssumir}
              testID="botao-assumir"
            />
          ) : null}
          {podeConcluir(ordem) && pode(papel, 'concluir_os') ? (
            concluindo ? (
              <FormularioDeConclusaoDaOrdem
                podeEscrever={podeEscrever}
                aoConcluir={(corpo) => concluir.mutate(corpo)}
                aoCancelar={() => setConcluindo(false)}
              />
            ) : (
              <Botao
                titulo="Concluir…"
                desabilitado={!podeEscrever}
                dica="Abre o formulário de conclusão"
                onPress={() => setConcluindo(true)}
                testID="botao-concluir"
              />
            )
          ) : null}
          {!mostraAcoes && podeConcluir(ordem) ? (
            <Texto tamanho="13" tom="apoio">
              Assumir e concluir: técnico ou administrador.
            </Texto>
          ) : null}
          {!conexao.podeEscrever && mostraAcoes ? (
            <Texto tamanho="13" tom="apoio">
              Sem conexão: as ações ficam desligadas. Nada é guardado para enviar depois.
            </Texto>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

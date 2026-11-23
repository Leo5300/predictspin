import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'

import {
  cancelarSupressao,
  chaves,
  consultaAlarme,
  consultaLimites,
  reconhecerAlarme,
  suprimirAlarme,
} from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import type { Alarme, AlarmeDetalhe, SegundaOpiniao } from '@/api/tipos'
import { ALVO_DE_TOQUE, Botao, Carregando, Mensagem, Modulo } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { SeloSim } from '@/componentes/Hachura'
import { IconeDoAlarme } from '@/componentes/IconeDoAlarme'
import { SegurarParaConfirmar } from '@/componentes/SegurarParaConfirmar'
import { Texto } from '@/componentes/Texto'
import {
  aparenciaDoAlarme,
  reconhecivel,
  resumoDaOpiniao,
  ROTULO_ACAO_HISTORICO,
  ROTULO_ESTADO_ALARME,
  ROTULO_NIVEL,
  rotuloDaMedida,
  suprimivel,
  supressaoCancelavel,
} from '@/dominio/alarme'
import {
  formatarDataHora,
  formatarMinutos,
  formatarNumero,
  formatarPercentual,
  formatarZ,
} from '@/dominio/formato'
import { pode } from '@/dominio/permissoes'
import { GRANDEZAS } from '@/dominio/pontos'
import { avisar } from '@/estado/avisos'
import { useConexao } from '@/hooks/basicos'

import { TOM_DO_TEXTO } from './TelaAlarmes'

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
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

/** Valor da medida dominante com as casas e a unidade dela. */
function valorDaMedida(alarme: Alarme): string {
  const g = GRANDEZAS.find((x) => x.chave === alarme.metrica)
  const texto = formatarNumero(alarme.valor, g?.casas ?? 3)
  return g?.unidade ? `${texto} ${g.unidade}` : texto
}

/** Segunda opinião do modelo, sem cor de estado: quem acende atenção e alarme é a regra. */
function BlocoSegundaOpiniao({ opiniao }: { opiniao: SegundaOpiniao }) {
  return (
    <Modulo rotulo="Segunda opinião do modelo" testID="segunda-opiniao">
      <Texto peso="medio">{resumoDaOpiniao(opiniao, (v) => formatarPercentual(v))}</Texto>
      <Texto tamanho="13" tom="apoio" className="mt-1">
        Segunda opinião, não muda o alarme.
      </Texto>
      <Texto tamanho="12" tom="fraco" className="mt-1">
        modelo versão {opiniao.versao}
        {opiniao.simulado ? ' · treinado com dado simulado: não é resultado' : ''}
      </Texto>
    </Modulo>
  )
}

/** Suprimir: só ADMIN, com motivo e prazo; os prazos vêm da API (rota de limites). */
function FormularioDeSupressao({
  aoSuprimir,
  aoCancelar,
  podeEscrever,
}: {
  aoSuprimir: (motivo: string, minutos: number) => void
  aoCancelar: () => void
  podeEscrever: boolean
}) {
  const limites = useQuery(consultaLimites())
  const prazos = limites.data?.alarme.supressao_opcoes_min ?? []
  const [motivo, setMotivo] = useState('')
  const [escolhido, setEscolhido] = useState<number | null>(null)
  const minutos = escolhido ?? (prazos.includes(60) ? 60 : (prazos[0] ?? null))
  const pronto = motivo.trim().length > 0 && minutos !== null
  return (
    <View className="gap-3" testID="form-supressao">
      <View className="gap-1">
        <Texto rotulo nativeID="rotulo-motivo">
          Motivo
        </Texto>
        <TextInput
          accessibilityLabel="Motivo da supressão"
          accessibilityLabelledBy="rotulo-motivo"
          value={motivo}
          onChangeText={setMotivo}
          maxLength={500}
          multiline
          placeholder="por que silenciar"
          maxFontSizeMultiplier={1.3}
          className="border border-linha-forte bg-rebaixo px-3 py-2 font-sans text-15 text-texto"
          placeholderTextColorClassName="accent-fraco"
          style={{ minHeight: ALVO_DE_TOQUE }}
          testID="campo-motivo"
        />
      </View>
      <View className="gap-1">
        <Texto rotulo>Prazo</Texto>
        {limites.isPending ? <Carregando texto="Lendo os prazos da API…" /> : null}
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {prazos.map((p) => {
            const marcado = p === minutos
            return (
              <Pressable
                key={p}
                onPress={() => setEscolhido(p)}
                accessibilityRole="radio"
                accessibilityState={{ checked: marcado }}
                accessibilityLabel={formatarMinutos(p)}
                className={`items-center justify-center border px-4 ${marcado ? 'border-linha-forte bg-rebaixo' : 'border-linha bg-modulo'}`}
                style={{ minHeight: ALVO_DE_TOQUE, minWidth: 72 }}
              >
                <Texto familia="mono" peso={marcado ? 'forte' : 'normal'}>
                  {formatarMinutos(p)}
                </Texto>
              </Pressable>
            )
          })}
        </View>
      </View>
      <SegurarParaConfirmar
        titulo={minutos !== null ? `Segure para suprimir por ${formatarMinutos(minutos)}` : 'Segure para suprimir'}
        desabilitado={!pronto || !podeEscrever}
        motivoDesabilitado={!podeEscrever ? 'Sem conexão com a API.' : 'Escreva o motivo e escolha o prazo.'}
        aoConfirmar={() => {
          if (pronto && minutos !== null) aoSuprimir(motivo.trim(), minutos)
        }}
        testID="segurar-suprimir"
      />
      <Botao titulo="Cancelar" onPress={aoCancelar} />
    </View>
  )
}

/**
 * Detalhe do alarme: motivo, valores que dispararam, linha do tempo, OS ligada e a segunda opinião
 * do modelo (quando a API manda). Reconhecer segurando; suprimir e cancelar supressão só para quem a
 * API permite. Depois de cada ação, a tela mostra a resposta da API, nunca um estado inventado.
 */
export function TelaDetalheAlarme({ alertaId }: { alertaId: number }) {
  const cliente = useQueryClient()
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const conexao = useConexao()
  const detalhe = useQuery(consultaAlarme(alertaId))
  const [suprimindo, setSuprimindo] = useState(false)

  const aplicarResposta = (alerta: Alarme) => {
    cliente.setQueryData<AlarmeDetalhe>(chaves.alarme(alertaId), (antigo) =>
      antigo ? { ...antigo, alerta } : antigo,
    )
    void cliente.invalidateQueries({ queryKey: chaves.alarme(alertaId) })
    void cliente.invalidateQueries({ queryKey: chaves.alarmes(alerta.simulado) })
  }
  const aoErrar = (erro: unknown) => avisar(mensagemDoErro(erro))
  const reconhecer = useMutation({ mutationFn: () => reconhecerAlarme(alertaId), onSuccess: aplicarResposta, onError: aoErrar })
  const suprimir = useMutation({
    mutationFn: (p: { motivo: string; minutos: number }) => suprimirAlarme(alertaId, p.motivo, p.minutos),
    onSuccess: (alerta) => {
      setSuprimindo(false)
      aplicarResposta(alerta)
    },
    onError: aoErrar,
  })
  const cancelar = useMutation({ mutationFn: () => cancelarSupressao(alertaId), onSuccess: aplicarResposta, onError: aoErrar })

  if (detalhe.isPending) {
    return (
      <View className="flex-1 bg-fundo">
        <Cabecalho titulo="Alarme" voltar />
        <Carregando />
      </View>
    )
  }
  if (detalhe.isError) {
    return (
      <View className="flex-1 bg-fundo">
        <Cabecalho titulo="Alarme" voltar />
        <Mensagem
          titulo="Não foi possível ler o alarme."
          acao={<Botao titulo="Tentar de novo" onPress={() => void detalhe.refetch()} />}
        >
          {mensagemDoErro(detalhe.error)}
        </Mensagem>
      </View>
    )
  }

  const { alerta, historico } = detalhe.data
  const aparencia = aparenciaDoAlarme(alerta)
  const instrumento = alerta.tipo === 'instrumento'
  const opiniao = alerta.opiniao_recente ?? alerta.opiniao_abertura
  const ocupado = reconhecer.isPending || suprimir.isPending || cancelar.isPending

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo={`${aparencia.rotulo} · ponto ${alerta.ponto}`} subtitulo={alerta.maquina} voltar />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} testID="detalhe-alarme">
        <Modulo>
          <View className="flex-row items-start gap-3">
            <IconeDoAlarme alarme={alerta} />
            <View className="flex-1 gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Texto peso="forte" tom={TOM_DO_TEXTO[aparencia.tom]} style={{ letterSpacing: 0.8 }}>
                  {aparencia.rotulo}
                </Texto>
                {alerta.simulado ? <SeloSim /> : null}
              </View>
              <Texto peso="medio" testID="estado-alarme">
                {ROTULO_ESTADO_ALARME[alerta.estado]}
              </Texto>
              <Texto tamanho="13" tom="apoio">
                prioridade {alerta.prioridade} · nível atual {ROTULO_NIVEL[alerta.nivel].toLowerCase()}
              </Texto>
              {instrumento ? (
                <Texto tamanho="13" tom="info">
                  Alerta do sensor (instrumento), não da máquina.
                </Texto>
              ) : null}
              {alerta.durante_ensaio_de_condicao ? (
                <Texto tamanho="13" tom="apoio">
                  durante ensaio de {alerta.condicao_ensaio?.replaceAll('_', ' ')}: não abre OS
                </Texto>
              ) : null}
            </View>
          </View>
        </Modulo>

        <Modulo rotulo="Ação recomendada">
          <Texto tamanho="18" peso="medio">
            {alerta.acao_recomendada}
          </Texto>
          {alerta.explicacao ? (
            <Texto tom="apoio" className="mt-2">
              {alerta.explicacao}
            </Texto>
          ) : null}
        </Modulo>

        <Modulo rotulo="O que disparou">
          {instrumento ? null : <Linha rotulo="Medida">{rotuloDaMedida(alerta.metrica)}</Linha>}
          {instrumento ? null : <Linha rotulo="Valor">{valorDaMedida(alerta)}</Linha>}
          {alerta.z !== null ? <Linha rotulo="z agora">{formatarZ(alerta.z)}</Linha> : null}
          {alerta.pior_z !== null ? (
            <Linha rotulo="Pior">
              z {formatarZ(alerta.pior_z)} · {ROTULO_NIVEL[alerta.pior_nivel].toLowerCase()}
            </Linha>
          ) : null}
          {alerta.componente ? <Linha rotulo="Componente">{alerta.componente}</Linha> : null}
          <Linha rotulo="Aberto em">{formatarDataHora(alerta.criado_em)}</Linha>
          {alerta.reconhecido_em ? (
            <Linha rotulo="Reconhecido">
              {formatarDataHora(alerta.reconhecido_em)}
              {alerta.reconhecido_por ? ` por ${alerta.reconhecido_por}` : ''}
            </Linha>
          ) : null}
          {alerta.estado === 'suprimido' && alerta.suprimido_ate ? (
            <Linha rotulo="Suprimido até">
              {formatarDataHora(alerta.suprimido_ate)}
              {alerta.motivo_supressao ? `: ${alerta.motivo_supressao}` : ''}
            </Linha>
          ) : null}
          {alerta.ordem_servico_id !== null ? (
            <Linha rotulo="OS ligada">nº {alerta.ordem_servico_id} (detalhe da OS no painel)</Linha>
          ) : null}
        </Modulo>

        {opiniao ? <BlocoSegundaOpiniao opiniao={opiniao} /> : null}

        <Modulo rotulo="Linha do tempo">
          {historico.map((m, i) => (
            <View key={`${m.ocorrido_em}-${i}`} className="flex-row gap-3 border-b border-linha py-2">
              <Texto tamanho="12" familia="mono" tom="apoio" className="w-24">
                {formatarDataHora(m.ocorrido_em)}
              </Texto>
              <View className="flex-1">
                <Texto tamanho="13" peso="medio">
                  {ROTULO_ACAO_HISTORICO[m.acao] ?? m.acao} · {ROTULO_NIVEL[m.nivel].toLowerCase()}
                </Texto>
                <Texto tamanho="12" tom="apoio">
                  {m.usuario ?? 'regra'}
                  {m.detalhe ? ` · ${m.detalhe}` : ''}
                </Texto>
              </View>
            </View>
          ))}
        </Modulo>

        <View className="gap-3 px-4 pt-4">
          {reconhecivel(alerta) && pode(papel, 'reconhecer_alarme') ? (
            <SegurarParaConfirmar
              titulo={reconhecer.isPending ? 'Reconhecendo…' : 'Segure para reconhecer'}
              desabilitado={!conexao.podeEscrever || ocupado}
              motivoDesabilitado={!conexao.podeEscrever ? 'Sem conexão com a API.' : 'Aguarde a resposta da API.'}
              aoConfirmar={() => reconhecer.mutate()}
              testID="segurar-reconhecer"
            />
          ) : null}
          {suprimivel(alerta) && pode(papel, 'suprimir_alarme') ? (
            suprimindo ? (
              <FormularioDeSupressao
                podeEscrever={conexao.podeEscrever && !ocupado}
                aoSuprimir={(motivo, minutos) => suprimir.mutate({ motivo, minutos })}
                aoCancelar={() => setSuprimindo(false)}
              />
            ) : (
              <Botao
                titulo="Suprimir…"
                desabilitado={!conexao.podeEscrever || ocupado}
                dica="Silencia o alarme por um prazo, com motivo"
                onPress={() => setSuprimindo(true)}
                testID="botao-suprimir"
              />
            )
          ) : null}
          {supressaoCancelavel(alerta) && pode(papel, 'cancelar_supressao') ? (
            <Botao
              titulo="Cancelar supressão"
              carregando={cancelar.isPending}
              desabilitado={!conexao.podeEscrever || ocupado}
              onPress={() => cancelar.mutate()}
              testID="botao-cancelar-supressao"
            />
          ) : null}
          {!conexao.podeEscrever ? (
            <Texto tamanho="13" tom="apoio">
              Sem conexão: as ações ficam desligadas. Nada é guardado para enviar depois.
            </Texto>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

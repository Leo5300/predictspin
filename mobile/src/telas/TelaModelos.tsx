import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, ScrollView, View } from 'react-native'

import { ativarModelo, chaves, consultaModelo, consultaModelos } from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import type { ModeloResumo, ValidacaoModelo } from '@/api/tipos'
import { ALVO_DE_TOQUE, Botao, Carregando, Mensagem, Modulo } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { SeloSim } from '@/componentes/Hachura'
import { SegurarParaConfirmar } from '@/componentes/SegurarParaConfirmar'
import { SemMaquina } from '@/componentes/SemMaquina'
import { Texto } from '@/componentes/Texto'
import { formatarDataHora, formatarNumero, formatarPercentual } from '@/dominio/formato'
import {
  AVISO_DA_VALIDACAO,
  consequenciaDeAtivar,
  nomeDaClasse,
  ordenarModelos,
  ROTULO_ESTADO_MODELO,
  temMetricas,
} from '@/dominio/modelos'
import { pode } from '@/dominio/permissoes'
import { avisar } from '@/estado/avisos'
import { useFonte } from '@/estado/preferencias'
import { useConexao } from '@/hooks/basicos'
import { useMaquinaAtualComEstado } from '@/hooks/useMaquinaAtual'

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatarPercentual(v, 1))

function quemTreinou(m: ModeloResumo): string {
  return `treinada por ${m.criado_por ?? 'serviço de treino'} em ${formatarDataHora(m.criado_em)}`
}

function quemAtivou(m: ModeloResumo): string | null {
  return m.ativado_por ? `ativada por ${m.ativado_por}${m.ativado_em ? ` em ${formatarDataHora(m.ativado_em)}` : ''}` : null
}

/** Uma versão na lista: estado, versão, F1 por ensaio, quem treinou e quem ativou. */
function LinhaDoModelo({ modelo }: { modelo: ModeloResumo }) {
  const ativou = quemAtivou(modelo)
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/conta/modelos/[modeloId]', params: { modeloId: String(modelo.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`Versão ${modelo.versao}, ${ROTULO_ESTADO_MODELO[modelo.estado]?.toLowerCase() ?? modelo.estado}. ${quemTreinou(modelo)}.${ativou ? ` ${ativou}.` : ''}${modelo.simulado ? ' Dado simulado.' : ''}`}
      accessibilityHint="Abre as métricas da versão"
      className={`gap-0.5 border-b bg-modulo px-4 py-3 ${modelo.estado === 'ativo' ? 'border-l-4 border-l-linha-forte border-b-linha' : 'border-linha'}`}
      style={{ minHeight: ALVO_DE_TOQUE + 16 }}
      testID={`linha-modelo-${modelo.id}`}
    >
      <View className="flex-row flex-wrap items-center gap-2">
        <Texto peso="forte" tamanho="13" style={{ letterSpacing: 0.8 }}>
          {ROTULO_ESTADO_MODELO[modelo.estado] ?? modelo.estado}
        </Texto>
        <Texto familia="mono" peso="forte">
          v{modelo.versao}
        </Texto>
        {modelo.simulado ? <SeloSim /> : null}
      </View>
      <Texto tamanho="13">
        {modelo.f1_macro_por_ensaio === null
          ? modelo.classes.length === 0
            ? 'só anomalia, sem classificador'
            : 'sem validação'
          : 'F1 por ensaio '}
        {modelo.f1_macro_por_ensaio === null ? null : (
          <Texto tamanho="13" familia="mono">
            {formatarNumero(modelo.f1_macro_por_ensaio, 2)}
          </Texto>
        )}
      </Texto>
      <Texto tamanho="12" tom="apoio">
        {quemTreinou(modelo)}
      </Texto>
      {ativou ? (
        <Texto tamanho="12" tom="apoio">
          {ativou}
        </Texto>
      ) : null}
    </Pressable>
  )
}

/** Versões da máquina e do tipo de dado em uso. Treinar fica no painel (trabalho de mesa). */
export function TelaModelos() {
  const estado = useMaquinaAtualComEstado()
  const maquina = estado.situacao === 'pronta' ? estado.maquina : null
  const simulado = useFonte() === 'simulado'
  const modelos = useQuery({ ...consultaModelos(maquina?.id ?? 0, simulado), enabled: Boolean(maquina) })
  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo="Modelos da IA" subtitulo={maquina?.codigo} voltar />
      {estado.situacao !== 'pronta' ? (
        <SemMaquina estado={estado} />
      ) : modelos.isPending ? (
        <Carregando />
      ) : modelos.isError ? (
        <Mensagem
          titulo="Não foi possível ler os modelos."
          acao={<Botao titulo="Tentar de novo" onPress={() => void modelos.refetch()} />}
        >
          {mensagemDoErro(modelos.error)}
        </Mensagem>
      ) : (
        <FlatList
          data={ordenarModelos(modelos.data)}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => <LinhaDoModelo modelo={item} />}
          ListHeaderComponent={
            <Texto tamanho="13" tom="apoio" className="px-4 py-3">
              O modelo só dá a segunda opinião; quem acende atenção e alarme é a regra. Treinar é no painel.
            </Texto>
          }
          ListEmptyComponent={<Mensagem titulo="Nenhuma versão treinada ainda.">Treine pelo painel.</Mensagem>}
          contentContainerStyle={{ paddingBottom: 32 }}
          testID="lista-modelos"
        />
      )}
    </View>
  )
}

/** Uma validação (por ensaio ou por dia): F1, recall por classe, matriz e a comparação com a regra. */
export function Validacao({ titulo, v }: { titulo: string; v: ValidacaoModelo }) {
  const c = v.classificador
  return (
    <Modulo rotulo={titulo} testID={`validacao-${titulo}`}>
      {!temMetricas(v) ? (
        <Texto tom="apoio">{v.motivo ?? 'Sem métricas para esta validação.'}</Texto>
      ) : (
        <View className="gap-3">
          {c ? (
            <>
              <Texto>
                F1 macro{' '}
                <Texto familia="mono" peso="forte">
                  {formatarNumero(c.f1_macro, 2)}
                </Texto>
                <Texto tom="apoio">
                  {' '}
                  · {c.janelas} janelas{v.k ? ` · ${v.k} partes` : ''}
                  {v.dias ? ` · ${v.dias} dias` : ''}
                </Texto>
              </Texto>
              <View>
                <Texto tamanho="12" rotulo>
                  Recall por classe
                </Texto>
                {c.classes.map((classe) => (
                  <View key={classe} className="flex-row justify-between py-0.5">
                    <Texto tamanho="13">{nomeDaClasse(classe)}</Texto>
                    <Texto tamanho="13" familia="mono">
                      {pct(c.recall[classe])}
                    </Texto>
                  </View>
                ))}
              </View>
              <View accessible accessibilityLabel={`Matriz de confusão: linhas são a classe real, colunas a prevista.`}>
                <Texto tamanho="12" rotulo>
                  Matriz de confusão (linha = real)
                </Texto>
                <ScrollView horizontal showsHorizontalScrollIndicator testID="matriz-confusao">
                  <View>
                {c.matriz_confusao.map((linha, i) => (
                  <View key={c.classes[i] ?? i} className="flex-row items-center gap-1 py-0.5">
                    <Texto tamanho="12" tom="apoio" style={{ width: 132 }}>
                      {nomeDaClasse(c.classes[i] ?? '')}
                    </Texto>
                    {linha.map((n, k) => (
                      <Texto
                        key={k}
                        tamanho="12"
                        familia="mono"
                        peso={i === k ? 'forte' : 'normal'}
                        className="w-10 text-right"
                      >
                        {n}
                      </Texto>
                    ))}
                  </View>
                ))}
                  </View>
                </ScrollView>
              </View>
            </>
          ) : (
            <Texto tom="apoio">Sem classificador (menos de 2 classes com ensaios suficientes).</Texto>
          )}
          {v.comparacao ? (
            <View>
              <Texto tamanho="12" rotulo>
                Regra × modelo nas mesmas janelas
              </Texto>
              {(
                [
                  ['Regra (z, sem atraso)', v.comparacao.regra],
                  ['Isolation Forest', v.comparacao.isolation_forest],
                ] as const
              ).map(([nome, t]) => (
                <Texto key={nome} tamanho="13" className="py-0.5">
                  {nome}: alarma no normal <Texto familia="mono">{pct(t.falso_positivo)}</Texto> · detecta o não normal{' '}
                  <Texto familia="mono">{pct(t.deteccao)}</Texto>
                </Texto>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Modulo>
  )
}

/**
 * Detalhe da versão: avisos da API, o aviso da validação acima das métricas (igual ao painel), as duas
 * validações e, para ADMIN, ativar segurando, com a frase de consequência.
 */
export function TelaDetalheModelo({ modeloId }: { modeloId: number }) {
  const cliente = useQueryClient()
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const conexao = useConexao()
  const detalhe = useQuery(consultaModelo(modeloId))
  const lista = useQuery({
    ...consultaModelos(detalhe.data?.modelo.maquina_id ?? 0, detalhe.data?.modelo.simulado ?? false),
    enabled: Boolean(detalhe.data),
  })
  const [confirmando, setConfirmando] = useState(false)
  const ativar = useMutation({
    mutationFn: () => ativarModelo(modeloId),
    onSuccess: (novo) => {
      setConfirmando(false)
      cliente.setQueryData(chaves.modelo(modeloId), novo)
      void cliente.invalidateQueries({ queryKey: chaves.modelos(novo.modelo.maquina_id, novo.modelo.simulado) })
      avisar(`Versão ${novo.modelo.versao} ativa: as próximas janelas recebem a segunda opinião dela.`)
    },
    onError: (erro) => avisar(mensagemDoErro(erro)),
  })

  if (detalhe.isPending) {
    return (
      <View className="flex-1 bg-fundo">
        <Cabecalho titulo="Modelo" voltar />
        <Carregando />
      </View>
    )
  }
  if (detalhe.isError) {
    return (
      <View className="flex-1 bg-fundo">
        <Cabecalho titulo="Modelo" voltar />
        <Mensagem
          titulo="Não foi possível ler a versão."
          acao={<Botao titulo="Tentar de novo" onPress={() => void detalhe.refetch()} />}
        >
          {mensagemDoErro(detalhe.error)}
        </Mensagem>
      </View>
    )
  }

  const { modelo, metadados, avisos } = detalhe.data
  const ativaAgora = lista.data?.find((m) => m.estado === 'ativo' && m.id !== modelo.id)?.versao ?? null
  const ativou = quemAtivou(modelo)

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo={`Versão ${modelo.versao}`} subtitulo={ROTULO_ESTADO_MODELO[modelo.estado] ?? modelo.estado} voltar />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} testID="detalhe-modelo">
        <Modulo>
          <View className="flex-row flex-wrap items-center gap-2">
            <Texto peso="forte" style={{ letterSpacing: 0.8 }} testID="estado-modelo">
              {ROTULO_ESTADO_MODELO[modelo.estado] ?? modelo.estado}
            </Texto>
            {modelo.simulado ? <SeloSim /> : null}
          </View>
          <Texto tamanho="13" tom="apoio" className="mt-1">
            {quemTreinou(modelo)}
          </Texto>
          {ativou ? (
            <Texto tamanho="13" tom="apoio">
              {ativou}
            </Texto>
          ) : null}
          <Texto tamanho="13" tom="apoio">
            limite de anomalia {formatarNumero(metadados.limiar_anomalia, 2)} · referência v
            {metadados.referencia_numero ?? '—'} · {metadados.caracteristicas.length} características
          </Texto>
          {avisos.map((a) => (
            <Texto key={a} tamanho="13" peso="medio" className="mt-1">
              {a}
            </Texto>
          ))}
        </Modulo>
        <View className="border-b border-linha-forte bg-rebaixo px-4 py-3" testID="aviso-validacao">
          <Texto tamanho="13">{AVISO_DA_VALIDACAO}</Texto>
        </View>
        <Validacao titulo="Validação por ensaio" v={metadados.metricas.por_ensaio} />
        <Validacao titulo="Validação por dia" v={metadados.metricas.por_dia} />
        {metadados.classes_fora.length > 0 ? (
          <Texto tamanho="13" tom="apoio" className="px-4 pt-3">
            Fora do classificador (poucos ensaios):{' '}
            {metadados.classes_fora.map((c) => `${nomeDaClasse(c.classe)} (${c.ensaios})`).join(', ')}
          </Texto>
        ) : null}
        {modelo.estado !== 'ativo' && pode(papel, 'ativar_modelo') ? (
          <View className="gap-3 px-4 pt-4">
            {confirmando ? (
              <>
                <Texto testID="consequencia">{consequenciaDeAtivar(modelo.versao, ativaAgora)}</Texto>
                <SegurarParaConfirmar
                  titulo={ativar.isPending ? 'Ativando…' : `Segure para ativar a versão ${modelo.versao}`}
                  desabilitado={!conexao.podeEscrever || ativar.isPending}
                  motivoDesabilitado={!conexao.podeEscrever ? 'Sem conexão com a API.' : 'Aguarde a resposta da API.'}
                  aoConfirmar={() => ativar.mutate()}
                  testID="segurar-ativar"
                />
                <Botao titulo="Cancelar" onPress={() => setConfirmando(false)} />
              </>
            ) : (
              <Botao
                titulo="Ativar…"
                desabilitado={!conexao.podeEscrever}
                dica="Mostra o que muda e pede para segurar"
                onPress={() => setConfirmando(true)}
                testID="botao-ativar"
              />
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

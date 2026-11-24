import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'

import {
  chaves,
  consultaAvaliacao,
  consultaLimites,
  consultaMaquinas,
  consultaPontos,
  consultaSerieRecente,
} from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import type { Janela, Ponto } from '@/api/tipos'
import { Botao, Carregando, Leitura, Mensagem, Modulo, SeloEstado, useCoresDoAtualizar } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { SeloSim } from '@/componentes/Hachura'
import {
  AmostraDoPonto,
  PlacaEstado,
  ReguaDesvio,
  Rotacao,
  Sparkline,
} from '@/componentes/Instrumento'
import { Texto } from '@/componentes/Texto'
import { instrumentoPorPonto } from '@/dominio/alarme'
import {
  aparenciaDoPonto,
  estadoDaMaquina,
  zMaximo,
  type AparenciaDoPonto,
  type Limites,
} from '@/dominio/estado'
import { formatarG, formatarIdade } from '@/dominio/formato'
import type { Frescor } from '@/dominio/idade'
import { marchaMaisProxima, ordenarCodigos, rotuloDoPapel } from '@/dominio/pontos'
import { useFonte } from '@/estado/preferencias'
import { useAlarmes, useUltimaJanela } from '@/hooks/useDadosDaMaquina'

export type DadosDoPonto = {
  codigo: string
  papel: string
  rms: number | null
  z: number | null
  aparencia: AparenciaDoPonto
  serie: (number | null)[]
  simulado: boolean
}

/** Uma linha por ponto: letra e estilo, RMS, estado, régua de desvio e sparkline. */
export function LinhaDoPonto({
  ponto,
  limites,
  aoAbrir,
}: {
  ponto: DadosDoPonto
  limites: Limites | null
  aoAbrir?: () => void
}) {
  const { aparencia } = ponto
  const apagado = aparencia.valoresApagados
  const comparado = aparencia.chave === 'normal' || aparencia.chave === 'atencao' || aparencia.chave === 'alarme'
  return (
    <Pressable
      onPress={aoAbrir}
      disabled={!aoAbrir}
      accessibilityRole="button"
      accessibilityLabel={`Ponto ${ponto.codigo}, ${rotuloDoPapel(ponto.papel)}. RMS ${formatarG(ponto.rms)} g. ${aparencia.rotulo}.${aparencia.oQueFazer ? ` ${aparencia.oQueFazer}` : ''}`}
      accessibilityHint="Abre o detalhe do ponto"
      className="gap-3 border-b border-linha bg-modulo px-4 py-4"
      testID={`linha-ponto-${ponto.codigo}`}
    >
      <View className="flex-row items-start gap-3">
        <AmostraDoPonto codigo={ponto.codigo} apagado={apagado} />
        <View className="flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Texto rotulo>{rotuloDoPapel(ponto.papel) || 'ponto'}</Texto>
            {ponto.simulado ? <SeloSim /> : null}
          </View>
          <Leitura rotulo="RMS" valor={formatarG(ponto.rms)} unidade="g" tamanho="32" apagado={apagado} />
        </View>
        {/* rótulo longo ("SEM REFERÊNCIA COMPLETA") quebra dentro do selo em vez de espremer o RMS */}
        <View className="items-end" style={{ maxWidth: '45%' }}>
          <SeloEstado
            rotulo={aparencia.rotulo}
            forma={aparencia.forma}
            tom={aparencia.tom}
            tracejado={aparencia.tracejado}
          />
        </View>
      </View>
      <ReguaDesvio z={comparado ? ponto.z : null} limites={comparado ? limites : null} apagado={apagado} />
      <Sparkline valores={ponto.serie} codigo={ponto.codigo} apagado={apagado} />
      {aparencia.oQueFazer ? (
        <Texto tamanho="13" tom={apagado ? 'fraco' : 'apoio'}>
          {aparencia.oQueFazer}
        </Texto>
      ) : null}
    </Pressable>
  )
}

/** Junta os pontos cadastrados e os que vieram na janela, na ordem A, B, C. */
export function montarPontos(
  pontos: readonly Ponto[] | undefined,
  janela: Janela | null,
  frescor: Frescor,
  idadeS: number | null,
  instrumentos: ReadonlyMap<string, { acao_recomendada: string }>,
  serie: ReadonlyMap<string, (number | null)[]>,
): DadosDoPonto[] {
  const papeis = new Map<string, string>()
  for (const p of pontos ?? []) if (p.ativo) papeis.set(p.codigo, p.papel)
  for (const [codigo, dado] of Object.entries(janela?.pontos ?? {})) {
    if (!papeis.has(codigo)) papeis.set(codigo, dado.papel)
  }
  return ordenarCodigos(papeis.keys()).map((codigo) => {
    const dado = janela?.pontos[codigo]
    // ponto cadastrado que não veio na janela: sem dado deste ponto (o alerta de instrumento diz por quê)
    const frescorDoPonto: Frescor = janela && !dado ? 'ausente' : frescor
    return {
      codigo,
      papel: papeis.get(codigo) ?? '',
      rms: dado?.rms_g ?? null,
      z: zMaximo(dado?.avaliacao?.z),
      aparencia: aparenciaDoPonto(
        {
          frescor: frescorDoPonto,
          idadeS,
          avaliacao: dado?.avaliacao ?? null,
          instrumento: instrumentos.get(codigo) ?? null,
        },
        formatarIdade,
      ),
      serie: serie.get(codigo) ?? [],
      simulado: janela?.simulado ?? false,
    }
  })
}

/** Máquina (equivalente ao L1/L2 do painel): placa de estado, rotação e uma linha por ponto. */
export function TelaMaquina({ maquinaId, comVoltar = false }: { maquinaId: number; comVoltar?: boolean }) {
  const coresDoAtualizar = useCoresDoAtualizar()
  const simulado = useFonte() === 'simulado'
  const cliente = useQueryClient()
  const [atualizando, setAtualizando] = useState(false)
  const maquinas = useQuery(consultaMaquinas())
  const maquina = maquinas.data?.conteudo.find((m) => m.id === maquinaId) ?? null
  const pontos = useQuery(consultaPontos(maquinaId))
  const { consulta, janela, idadeS, frescor } = useUltimaJanela(maquinaId, simulado)
  const serie = useQuery(consultaSerieRecente(maquinaId, simulado))
  const avaliacao = useQuery(consultaAvaliacao(maquinaId, simulado))
  const limites = useQuery(consultaLimites())
  const alarmes = useAlarmes(simulado)

  const recarregar = async () => {
    setAtualizando(true)
    await Promise.allSettled([
      cliente.invalidateQueries({ queryKey: chaves.ultimaJanela(maquinaId, simulado) }),
      cliente.invalidateQueries({ queryKey: chaves.serieRecente(maquinaId, simulado) }),
      cliente.invalidateQueries({ queryKey: chaves.avaliacao(maquinaId, simulado) }),
      cliente.invalidateQueries({ queryKey: chaves.alarmes(simulado) }),
      cliente.invalidateQueries({ queryKey: chaves.pontos(maquinaId) }),
    ])
    setAtualizando(false)
  }

  const instrumentos = instrumentoPorPonto(
    (alarmes.data?.conteudo ?? []).filter((a) => a.maquina_id === maquinaId),
  )
  const seriePorPonto = new Map<string, (number | null)[]>()
  for (const intervalo of serie.data?.intervalos ?? []) {
    for (const codigo of serie.data?.pontos ?? []) {
      const lista = seriePorPonto.get(codigo) ?? []
      lista.push(intervalo.janelas > 0 ? (intervalo.pontos[codigo]?.rms_media_g ?? null) : null)
      seriePorPonto.set(codigo, lista)
    }
  }
  const linhas = montarPontos(pontos.data, janela, frescor, idadeS, instrumentos, seriePorPonto)
  const vivo = frescor === 'vivo'
  const estado = estadoDaMaquina(frescor, janela?.rotacao_rpm)
  // a marcha é a da API (avaliação da última janela); sem ela, a nominal mais próxima da placa
  const marcha =
    avaliacao.data?.janela_id === janela?.id && avaliacao.data?.marcha_rpm !== undefined
      ? (avaliacao.data?.marcha_rpm ?? null)
      : marchaMaisProxima(janela?.rotacao_rpm, maquina?.rotacoes_nominais_rpm ?? [])
  const limitesZ = limites.data ? { z_atencao: limites.data.alarme.z_atencao, z_alarme: limites.data.alarme.z_alarme } : null

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho
        titulo={maquina?.codigo ?? 'Máquina'}
        subtitulo={maquina ? `${maquina.modelo}${maquina.local?.nome ? ` · ${maquina.local.nome}` : ''}` : undefined}
        voltar={comVoltar}
      />
      <ScrollView
        refreshControl={<RefreshControl {...coresDoAtualizar} refreshing={atualizando} onRefresh={() => void recarregar()} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        testID="tela-maquina"
      >
        <Modulo testID="topo-maquina">
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <PlacaEstado estado={estado} />
            <Rotacao rpm={janela?.rotacao_rpm} vivo={vivo} marcha={vivo ? marcha : null} />
          </View>
          {frescor === 'velho' && idadeS !== null ? (
            <Texto tamanho="13" tom="fraco" className="mt-2" testID="aviso-velho">
              sem dados há {formatarIdade(idadeS)}
            </Texto>
          ) : null}
          {vivo && avaliacao.data?.explicacao && avaliacao.data.janela_id === janela?.id ? (
            <Texto tamanho="13" tom="apoio" className="mt-2">
              {avaliacao.data.explicacao}
            </Texto>
          ) : null}
        </Modulo>
        {consulta.isPending ? (
          <Carregando />
        ) : consulta.isError ? (
          <Mensagem
            titulo="Não foi possível ler a última janela."
            acao={<Botao titulo="Tentar de novo" onPress={() => void consulta.refetch()} />}
          >
            {mensagemDoErro(consulta.error)}
          </Mensagem>
        ) : janela === null ? (
          <Mensagem titulo={simulado ? 'Nenhuma janela simulada recebida.' : 'Nenhuma janela recebida.'}>
            {simulado
              ? 'Rode o simulador (analise/simulador.py) para ver dado simulado.'
              : 'O dispositivo desta máquina ainda não mandou medição. Para ver o simulador, troque a fonte para Simulado em Conta.'}
          </Mensagem>
        ) : null}
        {linhas.map((ponto) => (
          <LinhaDoPonto
            key={ponto.codigo}
            ponto={ponto}
            limites={limitesZ}
            aoAbrir={() =>
              router.push({
                pathname: '/maquina/[maquinaId]/[ponto]',
                params: { maquinaId: String(maquinaId), ponto: ponto.codigo },
              })
            }
          />
        ))}
      </ScrollView>
    </View>
  )
}

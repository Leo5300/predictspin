import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInUp, FadeOutUp, ReduceMotion } from 'react-native-reanimated'

import { useConexao } from '@/hooks/basicos'
import { dispensarAviso, useAviso } from '@/estado/avisos'
import { useFonte } from '@/estado/preferencias'
import { formatarIdade } from '@/dominio/formato'

import { ALVO_DE_TOQUE } from './Basicos'
import { Forma } from './Forma'
import { FaixaSimulado } from './Hachura'
import { Texto } from './Texto'

/**
 * Barra superior fixa e discreta: conexão com a API e "última janela há X s". Sem conexão, vira uma
 * faixa que avisa que os dados estão velhos e que as ações que escrevem na API estão desligadas.
 */
export function BarraSuperior({ idadeDaUltimaJanelaS }: { idadeDaUltimaJanelaS: number | null }) {
  const insets = useSafeAreaInsets()
  const conexao = useConexao()
  const simulado = useFonte() === 'simulado'
  const semConexao = !conexao.podeEscrever
  const ultima =
    idadeDaUltimaJanelaS === null ? 'nenhuma janela' : `última janela há ${formatarIdade(idadeDaUltimaJanelaS)}`
  return (
    <View className="border-b border-linha bg-fundo" style={{ paddingTop: insets.top }}>
      <View
        className="min-h-9 flex-row items-center justify-between gap-3 px-4"
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`Conexão: ${conexao.texto}. ${ultima}.`}
        testID="barra-superior"
      >
        <View className="flex-row items-center gap-1.5">
          <Forma
            forma={conexao.tom === 'ok' ? 'circulo' : 'anel'}
            tom={conexao.tom === 'ok' ? 'neutro' : 'apagado'}
            tamanho={10}
          />
          <Texto tamanho="12" tom="apoio">
            {conexao.texto}
          </Texto>
        </View>
        <Texto tamanho="12" familia="mono" tom="apoio" testID="idade-ultima-janela">
          {ultima}
        </Texto>
      </View>
      {semConexao ? (
        <View
          className="border-t border-linha-forte bg-rebaixo px-4 py-2"
          style={{ borderStyle: 'dashed' }}
          accessible
          accessibilityRole="alert"
          testID="faixa-sem-conexao"
        >
          <Texto tamanho="13" peso="medio">
            {conexao.texto === 'acordando o servidor'
              ? 'Acordando o servidor, aguarde. Os dados na tela podem estar velhos.'
              : 'Sem conexão com a API. Os dados na tela estão velhos.'}
          </Texto>
          <Texto tamanho="12" tom="apoio">
            Reconhecer e suprimir ficam desligados até a conexão voltar.
          </Texto>
        </View>
      ) : null}
      {simulado ? <FaixaSimulado /> : null}
    </View>
  )
}

/** Aviso curto no topo (alarme novo, ação recusada). Entra de cima e sai mais rápido do que entra. */
export function AvisoNoTopo() {
  const aviso = useAviso()
  if (!aviso) return null
  return (
    <Animated.View
      key={aviso.id}
      entering={FadeInUp.duration(220).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(150).reduceMotion(ReduceMotion.System)}
      className="absolute right-3 left-3 z-10 border border-linha-forte bg-modulo"
      style={{ top: 4 }}
      testID="aviso"
    >
      <Pressable
        onPress={dispensarAviso}
        accessibilityRole="button"
        accessibilityLabel={`${aviso.texto} Toque para fechar.`}
        className="justify-center px-4 py-2"
        style={{ minHeight: ALVO_DE_TOQUE }}
      >
        <Texto peso="medio">{aviso.texto}</Texto>
      </Pressable>
    </Animated.View>
  )
}

/** Cabeçalho de tela: título e, nas telas de detalhe, o botão de voltar com alvo de 56 dp. */
export function Cabecalho({
  titulo,
  voltar = false,
  extra,
  subtitulo,
}: {
  titulo: string
  voltar?: boolean
  extra?: ReactNode
  subtitulo?: string
}) {
  return (
    <View className="flex-row items-center gap-2 border-b border-linha bg-fundo pr-4" style={{ minHeight: ALVO_DE_TOQUE }}>
      {voltar ? (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          className="items-center justify-center"
          style={{ width: ALVO_DE_TOQUE, height: ALVO_DE_TOQUE }}
          testID="voltar"
        >
          <Texto tamanho="24" familia="mono">
            ‹
          </Texto>
        </Pressable>
      ) : (
        <View className="w-4" />
      )}
      <View className="flex-1 py-2">
        <Texto tamanho="18" peso="forte" accessibilityRole="header" numberOfLines={2}>
          {titulo}
        </Texto>
        {subtitulo ? (
          <Texto tamanho="13" tom="apoio" numberOfLines={2}>
            {subtitulo}
          </Texto>
        ) : null}
      </View>
      {extra}
    </View>
  )
}

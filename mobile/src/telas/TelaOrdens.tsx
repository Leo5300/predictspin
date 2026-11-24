import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, View } from 'react-native'

import { chaves, consultaOrdens } from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import type { OrdemServico } from '@/api/tipos'
import { ALVO_DE_TOQUE, Botao, Carregando, Escolha, Mensagem } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { SeloSim } from '@/componentes/Hachura'
import { Texto } from '@/componentes/Texto'
import { formatarHaQuanto } from '@/dominio/formato'
import {
  emDestaque,
  FILTROS_DE_ORDENS,
  ordenarOrdens,
  ROTULO_STATUS_ORDEM,
  type FiltroOrdens,
} from '@/dominio/ordens'
import { useFonte } from '@/estado/preferencias'
import { useAgoraParede } from '@/hooks/basicos'

/**
 * Uma linha da lista: status, máquina, ponto, componente provável, há quanto tempo, quem assumiu e o selo
 * SIM. Aberta e sem dono fica em destaque (borda forte e "ninguém assumiu"), sem cor: cor é só de alarme.
 */
export function LinhaDaOrdem({ ordem, agoraMs }: { ordem: OrdemServico; agoraMs: number }) {
  const destaque = emDestaque(ordem)
  const ha = formatarHaQuanto(ordem.aberta_em, agoraMs)
  const quem = ordem.responsavel ? `com ${ordem.responsavel}` : 'ninguém assumiu'
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/ordens/[osId]', params: { osId: String(ordem.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`${ordem.numero}, ${ROTULO_STATUS_ORDEM[ordem.status].toLowerCase()}, ${ordem.maquina}, ponto ${ordem.ponto}${ordem.componente ? `, ${ordem.componente}` : ''}. Aberta ${ha}, ${quem}.${ordem.simulado ? ' Dado simulado.' : ''}`}
      accessibilityHint="Abre o detalhe da OS"
      className={`flex-row gap-3 border-b bg-modulo px-4 py-3 ${destaque ? 'border-l-4 border-l-linha-forte border-b-linha' : 'border-linha'}`}
      style={{ minHeight: ALVO_DE_TOQUE + 16 }}
      testID={`linha-os-${ordem.id}`}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Texto tamanho="13" peso="forte" style={{ letterSpacing: 0.8 }}>
            {ROTULO_STATUS_ORDEM[ordem.status]}
          </Texto>
          <Texto familia="mono" peso="forte">
            {ordem.ponto}
          </Texto>
          <Texto tamanho="13" familia="mono" tom="apoio">
            {ordem.numero}
          </Texto>
          {ordem.simulado ? <SeloSim /> : null}
        </View>
        <Texto tamanho="13" peso="medio" numberOfLines={2}>
          {ordem.componente ?? 'componente não indicado'}
        </Texto>
        <Texto tamanho="13" tom={destaque ? 'texto' : 'apoio'} peso={destaque ? 'medio' : 'normal'}>
          {quem}
        </Texto>
        <Texto tamanho="12" tom="fraco" familia="mono">
          {ordem.maquina} · aberta {ha}
        </Texto>
      </View>
    </Pressable>
  )
}

/** Ordens de serviço da fonte em uso: abertas sem dono primeiro, depois em andamento e concluídas. */
export function TelaOrdens() {
  const simulado = useFonte() === 'simulado'
  const cliente = useQueryClient()
  const [filtro, setFiltro] = useState<FiltroOrdens>('todas')
  const ordens = useQuery(consultaOrdens(simulado, filtro))
  const [atualizando, setAtualizando] = useState(false)
  const agora = useAgoraParede(15_000)
  const lista = ordenarOrdens(ordens.data?.conteudo ?? [])

  const recarregar = async () => {
    setAtualizando(true)
    await cliente.invalidateQueries({ queryKey: chaves.ordens(simulado) })
    setAtualizando(false)
  }

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo="Ordens de serviço" />
      <View className="border-b border-linha bg-fundo px-4 py-2">
        <Escolha<FiltroOrdens> rotulo="Filtrar ordens" valor={filtro} aoMudar={setFiltro} opcoes={FILTROS_DE_ORDENS} />
      </View>
      {ordens.isPending ? (
        <Carregando />
      ) : ordens.isError ? (
        <Mensagem
          titulo="Não foi possível ler as ordens de serviço."
          acao={<Botao titulo="Tentar de novo" onPress={() => void ordens.refetch()} />}
        >
          {mensagemDoErro(ordens.error)}
        </Mensagem>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(o) => String(o.id)}
          renderItem={({ item }) => <LinhaDaOrdem ordem={item} agoraMs={agora} />}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => void recarregar()} />}
          ListEmptyComponent={
            <Mensagem titulo="Nenhuma OS aqui.">
              {filtro === 'todas'
                ? 'A API abre uma OS quando um alarme fica contínuo ou a severidade acumula.'
                : 'Troque o filtro para ver as outras.'}
            </Mensagem>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          testID="lista-ordens"
        />
      )}
    </View>
  )
}

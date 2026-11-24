import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, View } from 'react-native'

import { chaves } from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import type { Alarme } from '@/api/tipos'
import { ALVO_DE_TOQUE, Botao, Carregando, Mensagem, MarcaDaOpcao, useCoresDoAtualizar } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { SeloSim } from '@/componentes/Hachura'
import { IconeDoAlarme } from '@/componentes/IconeDoAlarme'
import { Texto, type TomDoTexto } from '@/componentes/Texto'
import {
  aparenciaDoAlarme,
  filtrarAlarmes,
  ROTULO_ESTADO_ALARME,
  rotuloDaMedida,
  type FiltroAlarmes,
} from '@/dominio/alarme'
import type { Tom } from '@/dominio/estado'
import { formatarHaQuanto, formatarZ } from '@/dominio/formato'
import { useFonte } from '@/estado/preferencias'
import { useAgoraParede } from '@/hooks/basicos'
import { useAlarmes } from '@/hooks/useDadosDaMaquina'

export const TOM_DO_TEXTO: Record<Tom, TomDoTexto> = {
  alarme: 'alarme',
  atencao: 'atencao',
  info: 'info',
  neutro: 'texto',
  apagado: 'apoio',
}

/** Uma linha da lista: ponto, estado ISA-18.2 em texto + forma + cor, motivo da API e há quanto. */
export function LinhaDoAlarme({ alarme, agoraMs }: { alarme: Alarme; agoraMs: number }) {
  const aparencia = aparenciaDoAlarme(alarme)
  const instrumento = alarme.tipo === 'instrumento'
  const motivo = alarme.explicacao ?? alarme.acao_recomendada
  const medida = instrumento
    ? 'sensor'
    : `${rotuloDaMedida(alarme.metrica)}${alarme.z !== null ? ` · z ${formatarZ(alarme.z)}` : ''}`
  const ha = formatarHaQuanto(alarme.criado_em, agoraMs)
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/alarmes/[alertaId]', params: { alertaId: String(alarme.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`${aparencia.rotulo}, ponto ${alarme.ponto}, ${alarme.maquina}. ${ROTULO_ESTADO_ALARME[alarme.estado]}. Prioridade ${alarme.prioridade}. ${motivo}. Aberto ${ha}.${alarme.simulado ? ' Dado simulado.' : ''}`}
      accessibilityHint="Abre o detalhe do alarme"
      className="flex-row gap-3 border-b border-linha bg-modulo px-4 py-3"
      style={{ minHeight: ALVO_DE_TOQUE + 16 }}
      testID={`linha-alarme-${alarme.id}`}
    >
      <IconeDoAlarme alarme={alarme} />
      <View className="flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Texto tamanho="13" peso="forte" tom={TOM_DO_TEXTO[aparencia.tom]} style={{ letterSpacing: 0.8 }}>
            {aparencia.rotulo}
          </Texto>
          <Texto familia="mono" peso="forte">
            {alarme.ponto}
          </Texto>
          <Texto tamanho="13" tom="apoio">
            {medida}
          </Texto>
          {alarme.simulado ? <SeloSim /> : null}
        </View>
        <Texto tamanho="13" peso="medio">
          {ROTULO_ESTADO_ALARME[alarme.estado]} · prioridade {alarme.prioridade}
        </Texto>
        {instrumento ? (
          <Texto tamanho="12" tom="info">
            alerta do sensor, não da máquina
          </Texto>
        ) : null}
        <Texto tamanho="13" tom="apoio" numberOfLines={3}>
          {motivo}
        </Texto>
        <Texto tamanho="12" tom="fraco" familia="mono">
          {alarme.maquina} · {ha}
        </Texto>
      </View>
    </Pressable>
  )
}

function Filtro({ valor, aoMudar }: { valor: FiltroAlarmes; aoMudar: (f: FiltroAlarmes) => void }) {
  const opcoes: { valor: FiltroAlarmes; rotulo: string }[] = [
    { valor: 'ativos', rotulo: 'Em aberto' },
    { valor: 'todos', rotulo: 'Todos' },
  ]
  return (
    <View
      className="flex-row border-b border-linha bg-fundo px-4 py-2"
      accessibilityRole="radiogroup"
      accessibilityLabel="Filtrar alarmes"
    >
      {opcoes.map((o) => {
        const marcado = o.valor === valor
        return (
          <Pressable
            key={o.valor}
            onPress={() => aoMudar(o.valor)}
            accessibilityRole="radio"
            accessibilityState={{ checked: marcado }}
            accessibilityLabel={o.rotulo}
            className={`flex-1 items-center justify-center border ${marcado ? 'border-linha-forte bg-rebaixo' : 'border-linha bg-modulo'}`}
            style={{ minHeight: ALVO_DE_TOQUE }}
            testID={`filtro-${o.valor}`}
          >
            <Texto peso={marcado ? 'forte' : 'normal'} tom={marcado ? 'texto' : 'apoio'}>
              {o.rotulo}
            </Texto>
            {marcado ? <MarcaDaOpcao /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

/** Alarmes da fonte em uso, ao vivo pelo evento "alerta": em aberto primeiro, por prioridade e hora. */
export function TelaAlarmes() {
  const coresDoAtualizar = useCoresDoAtualizar()
  const simulado = useFonte() === 'simulado'
  const cliente = useQueryClient()
  const alarmes = useAlarmes(simulado)
  const [filtro, setFiltro] = useState<FiltroAlarmes>('ativos')
  const [atualizando, setAtualizando] = useState(false)
  const agora = useAgoraParede(15_000)
  const lista = filtrarAlarmes(alarmes.data?.conteudo ?? [], filtro)

  const recarregar = async () => {
    setAtualizando(true)
    await cliente.invalidateQueries({ queryKey: chaves.alarmes(simulado) })
    setAtualizando(false)
  }

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo="Alarmes" />
      <Filtro valor={filtro} aoMudar={setFiltro} />
      {alarmes.isPending ? (
        <Carregando />
      ) : alarmes.isError ? (
        <Mensagem
          titulo="Não foi possível ler os alarmes."
          acao={<Botao titulo="Tentar de novo" onPress={() => void alarmes.refetch()} />}
        >
          {mensagemDoErro(alarmes.error)}
        </Mensagem>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(a) => String(a.id)}
          renderItem={({ item }) => <LinhaDoAlarme alarme={item} agoraMs={agora} />}
          refreshControl={<RefreshControl {...coresDoAtualizar} refreshing={atualizando} onRefresh={() => void recarregar()} />}
          ListEmptyComponent={
            <Mensagem titulo={filtro === 'ativos' ? 'Nenhum alarme em aberto.' : 'Nenhum alarme.'}>
              Sem referência calculada, a API não chama nada de atenção ou alarme. Com referência, cada
              ponto que sair do normal por tempo suficiente aparece aqui, com a ação recomendada.
            </Mensagem>
          }
          testID="lista-alarmes"
        />
      )}
    </View>
  )
}

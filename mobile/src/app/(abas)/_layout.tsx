import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { NativeTabs } from 'expo-router/native-tabs'
import { Platform, View } from 'react-native'

import { useSessao } from '@/api/sessao'
import { AvisoNoTopo, BarraSuperior } from '@/componentes/Casca'
import { podeVerAba, type Aba } from '@/dominio/permissoes'
import { useFonte } from '@/estado/preferencias'
import { useCores } from '@/hooks/basicos'
import { useUltimaJanela } from '@/hooks/useDadosDaMaquina'
import { useEventosAoVivo } from '@/hooks/useEventosAoVivo'
import { useMaquinaAtual } from '@/hooks/useMaquinaAtual'

type NomeDoIcone = keyof typeof MaterialCommunityIcons.glyphMap

const ICONES: Record<'maquina' | 'alarmes' | 'conta', { sf: string; md: NomeDoIcone }> = {
  maquina: { sf: 'gauge.with.dots.needle.33percent', md: 'gauge' },
  alarmes: { sf: 'exclamationmark.triangle', md: 'alert-outline' },
  conta: { sf: 'person.crop.circle', md: 'account-circle-outline' },
}

function Icone({ aba }: { aba: keyof typeof ICONES }) {
  const icone = ICONES[aba]
  return Platform.OS === 'ios' ? (
    // nomes de SF Symbols conferidos no catálogo do sistema
    <NativeTabs.Trigger.Icon sf={icone.sf as never} />
  ) : (
    <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={MaterialCommunityIcons} name={icone.md} />} />
  )
}

/**
 * Abas nativas (só as que o papel enxerga): Máquina, Alarmes e Conta; OS e Coleta entram na parte B.
 * Em cima, fixa, a barra de conexão e da última janela. Uma conexão de eventos ao vivo serve o app
 * inteiro. A troca de aba não anima.
 */
export default function LayoutAbas() {
  const sessao = useSessao()
  const papel = sessao.fase === 'autenticada' ? sessao.usuario.papel : null
  const simulado = useFonte() === 'simulado'
  const maquina = useMaquinaAtual()
  const cores = useCores()
  useEventosAoVivo(maquina?.id, simulado)
  const { idadeS } = useUltimaJanela(maquina?.id, simulado)
  const escondida = (aba: Aba) => !podeVerAba(papel, aba)

  return (
    <View className="flex-1 bg-fundo">
      <BarraSuperior idadeDaUltimaJanelaS={idadeS} />
      <View className="flex-1">
        <NativeTabs
          backgroundColor={cores.modulo}
          iconColor={{ default: cores.apoio, selected: cores.texto }}
          labelStyle={{ default: { color: cores.apoio }, selected: { color: cores.texto } }}
          indicatorColor={cores.realce}
          disableTransparentOnScrollEdge
        >
          <NativeTabs.Trigger name="maquina" hidden={escondida('maquina')}>
            <NativeTabs.Trigger.Label>Máquina</NativeTabs.Trigger.Label>
            <Icone aba="maquina" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="alarmes" hidden={escondida('alarmes')}>
            <NativeTabs.Trigger.Label>Alarmes</NativeTabs.Trigger.Label>
            <Icone aba="alarmes" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="conta" hidden={escondida('conta')}>
            <NativeTabs.Trigger.Label>Conta</NativeTabs.Trigger.Label>
            <Icone aba="conta" />
          </NativeTabs.Trigger>
        </NativeTabs>
        <AvisoNoTopo />
      </View>
    </View>
  )
}

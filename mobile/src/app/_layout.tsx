import '../global.css'

import { Doto_900Black } from '@expo-google-fonts/doto'
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono'
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Network from 'expo-network'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useUniwind } from 'uniwind'

import { ErroRede } from '@/api/erros'
import { aoApiVoltar, vigiarRedeDoAparelho } from '@/api/saude'
import { aoEncerrarSessao, useSessao } from '@/api/sessao'
import { esperaDaTentativaS } from '@/dominio/conexao'
import { carregarTema } from '@/estado/preferencias'
import { useCores } from '@/hooks/basicos'

void SplashScreen.preventAutoHideAsync()

// TanStack Query no celular: "em foco" = app na frente; "online" = aparelho com rede
focusManager.setEventListener((definir) => {
  const assinatura = AppState.addEventListener('change', (estado) => definir(estado === 'active'))
  return () => assinatura.remove()
})
onlineManager.setEventListener((definir) => {
  const assinatura = Network.addNetworkStateListener((estado) => definir(estado.isConnected !== false))
  return () => assinatura.remove()
})

function criarCliente() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // falha de rede (servidor acordando) tenta de novo com a espera do painel; erro da API, não
        retry: (falhas, erro) => erro instanceof ErroRede && falhas < 6,
        retryDelay: (falhas) => esperaDaTentativaS(falhas + 1) * 1000,
        refetchIntervalInBackground: false,
      },
      mutations: { retry: false },
    },
  })
}

export default function Raiz() {
  const [cliente] = useState(criarCliente)
  const [fontesProntas, erroDasFontes] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    Doto_900Black,
  })
  const sessao = useSessao()
  const cores = useCores()
  const { theme } = useUniwind()

  useEffect(() => {
    void carregarTema()
    const pararRede = vigiarRedeDoAparelho()
    // sair ou sessão vencida: nada das consultas fica no aparelho
    const pararSessao = aoEncerrarSessao(() => cliente.clear())
    const pararVolta = aoApiVoltar(() => void cliente.invalidateQueries())
    return () => {
      pararRede()
      pararSessao()
      pararVolta()
    }
  }, [cliente])

  useEffect(() => {
    if (fontesProntas || erroDasFontes) void SplashScreen.hideAsync()
  }, [fontesProntas, erroDasFontes])

  if (!fontesProntas && !erroDasFontes) return null

  const autenticada = sessao.fase === 'autenticada'
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: cores.fundo }}>
      <SafeAreaProvider>
        <QueryClientProvider client={cliente}>
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }}>
            <Stack.Screen name="index" />
            <Stack.Protected guard={autenticada}>
              <Stack.Screen name="(abas)" />
            </Stack.Protected>
            <Stack.Protected guard={!autenticada}>
              <Stack.Screen name="entrar" />
            </Stack.Protected>
            <Stack.Protected guard={__DEV__}>
              <Stack.Screen name="galeria" options={{ presentation: 'modal' }} />
            </Stack.Protected>
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

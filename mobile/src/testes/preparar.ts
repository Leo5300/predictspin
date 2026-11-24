/**
 * Preparação dos testes (jest-expo). Os módulos nativos viram simulações em memória: SecureStore,
 * biometria, haptics, notificações, rede e o Uniwind. Nada daqui vai para o app.
 */

// endereço de desenvolvimento na rede local, como no celular com a API do docker compose
process.env.EXPO_PUBLIC_API_URL = 'http://192.168.0.10:8080'

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))
// o mock oficial do Reanimated 4.7.1 não carrega no jest-expo; ver testes/reanimadoSimulado.tsx
jest.mock('react-native-reanimated', () => require('./reanimadoSimulado'))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

jest.mock('expo-secure-store', () => {
  const guardado = new Map<string, string>()
  return {
    __guardado: guardado,
    getItemAsync: jest.fn(async (chave: string) => guardado.get(chave) ?? null),
    setItemAsync: jest.fn(async (chave: string, valor: string) => {
      guardado.set(chave, valor)
    }),
    deleteItemAsync: jest.fn(async (chave: string) => {
      guardado.delete(chave)
    }),
  }
})

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}))

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))

// push: permissão ainda não perguntada; o token e as respostas de toque são trocados em cada teste
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  AndroidImportance: { DEFAULT: 5, HIGH: 6 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true, expires: 'never' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[teste]' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
}))

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}))

jest.mock('uniwind', () => ({
  Uniwind: { setTheme: jest.fn() },
  useUniwind: () => ({ theme: 'light', hasAdaptiveThemes: true }),
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
  useLocalSearchParams: jest.fn(() => ({})),
}))

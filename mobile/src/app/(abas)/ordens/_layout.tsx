import { Stack } from 'expo-router'

import { useCores } from '@/hooks/basicos'

export default function PilhaOrdens() {
  const cores = useCores()
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }} />
}

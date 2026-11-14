import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { TelaLogin } from '@/telas/login/TelaLogin'

const busca = z.object({
  /** Para onde voltar depois de entrar (caminho interno). */
  voltar: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: busca,
  component: RotaLogin,
})

function RotaLogin() {
  const { voltar } = Route.useSearch()
  return <TelaLogin voltar={voltar} />
}

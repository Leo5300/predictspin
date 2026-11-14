import { createFileRoute } from '@tanstack/react-router'

import { TelaVisaoGeral } from '@/telas/visao-geral/TelaVisaoGeral'

export const Route = createFileRoute('/_painel/')({
  component: TelaVisaoGeral,
})

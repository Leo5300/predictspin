import { createRootRoute, Outlet } from '@tanstack/react-router'

import { Toaster } from '@/componentes/ui/sonner'
import { TooltipProvider } from '@/componentes/ui/tooltip'

export const Route = createRootRoute({
  component: Raiz,
})

function Raiz() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  )
}

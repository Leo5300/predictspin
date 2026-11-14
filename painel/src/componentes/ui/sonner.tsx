import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useTema } from '@/estado/preferencias'
import { useTelaEstreita } from '@/hooks/useTelaEstreita'

/** Avisos (Sonner) no visual do painel: módulo com linha de 1 px, sem sombra e sem ícone decorativo. */
function Toaster(props: ToasterProps) {
  const tema = useTema()
  // no celular a parte de baixo é a zona do polegar (REC, Encerrar, Marcar evento): aviso vai em cima
  const estreita = useTelaEstreita()
  return (
    <Sonner
      theme={tema === 'grafite' ? 'dark' : 'light'}
      position={estreita ? 'top-center' : 'bottom-right'}
      visibleToasts={3}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[min(22rem,calc(100vw-2rem))] items-start gap-2 rounded-2 border border-linha-forte bg-modulo px-3 py-2 text-13 text-texto',
          title: 'font-medium',
          description: 'text-apoio',
          // erro e aviso de operação não são estado da máquina: borda tracejada, sem cor
          error: 'border-dashed border-texto',
          warning: 'border-dashed border-texto',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

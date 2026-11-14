import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useTema } from '@/estado/preferencias'

/** Avisos (Sonner) no visual do painel: módulo com linha de 1 px, sem sombra e sem ícone decorativo. */
function Toaster(props: ToasterProps) {
  const tema = useTema()
  return (
    <Sonner
      theme={tema === 'grafite' ? 'dark' : 'light'}
      position="bottom-right"
      visibleToasts={3}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[min(22rem,calc(100vw-2rem))] items-start gap-2 rounded-2 border border-linha-forte bg-modulo px-3 py-2 text-13 text-texto',
          title: 'font-medium',
          description: 'text-apoio',
          error: 'border-alarme-texto',
          warning: 'border-atencao-texto',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

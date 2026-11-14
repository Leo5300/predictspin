import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useSessao } from '@/api/sessao'
import { BarraSuperior } from '@/componentes/casca/BarraSuperior'
import { FaixaSimulado } from '@/componentes/instrumento/SeloSim'
import { useFonte } from '@/estado/preferencias'
import { TelaVerificando } from '@/telas/apoio/TelasDeApoio'

export const Route = createFileRoute('/_painel')({
  component: CascaDoPainel,
})

/** Tudo dentro desta rota exige sessão. Sem sessão, vai para o login e volta depois de entrar. */
function CascaDoPainel() {
  const sessao = useSessao()
  const fonte = useFonte()
  const roteador = useRouter()
  const anonima = sessao.fase === 'anonima'

  // Uma navegação só, quando a sessão fica anônima. Um <Navigate> aqui se repetia sem fim: enquanto
  // a rota de login carrega, esta casca continua montada e o efeito dele disparava de novo.
  useEffect(() => {
    if (!anonima) return
    const local = roteador.state.location
    if (local.pathname === '/login') return
    const caminho = local.href
    void roteador.navigate({
      to: '/login',
      search: caminho === '/' ? {} : { voltar: caminho },
      replace: true,
    })
  }, [anonima, roteador])

  if (sessao.fase === 'verificando' || sessao.fase === 'anonima') return <TelaVerificando />

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-1 focus:left-1 focus:z-50 focus:bg-modulo focus:px-2 focus:py-1"
      >
        Pular para o conteúdo
      </a>
      <div className="sticky top-0 z-40">
        <BarraSuperior usuario={sessao.usuario} />
        {fonte === 'simulado' ? <FaixaSimulado /> : null}
      </div>
      <main id="conteudo" className="min-w-0 flex-1 p-3">
        <Outlet />
      </main>
    </div>
  )
}

import './index.css'
import './lib/zod-sem-eval'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { validarSessaoAoAbrir } from '@/api/autenticacao'
import { ErroRede } from '@/api/erros'
import { aoApiVoltar } from '@/api/saude'
import { obterSessao } from '@/api/sessao'
import { esperaDaTentativaS } from '@/dominio/conexao'
import { aplicarTema, obterTema } from '@/estado/preferencias'
import { ErroDaRota, RotaNaoEncontrada } from '@/telas/apoio/TelasDeApoio'

import { routeTree } from './arvore-de-rotas.gen'

const clienteDeConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      // Só falha de rede é repetida (a API pode estar acordando); erro da API aparece na hora
      retry: (falhas, erro) => erro instanceof ErroRede && falhas < 4,
      retryDelay: (tentativa) => esperaDaTentativaS(tentativa + 1) * 1000,
      staleTime: 0,
    },
    mutations: { retry: false },
  },
})

const roteador = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: ErroDaRota,
  defaultNotFoundComponent: RotaNaoEncontrada,
  scrollRestoration: true,
  // L1 ↔ L2 ↔ L3: o navegador anima a troca de tela (conteúdo entra em 220 ms; o módulo do ponto
  // vira o cabeçalho da tela do ponto). Mudar só a busca (período, página, mapa) não anima.
  defaultViewTransition: {
    types: ({ pathChanged }) => (pathChanged ? ['tela'] : false),
  },
})

declare module '@tanstack/react-router' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Register {
    router: typeof roteador
  }
}

aplicarTema(obterTema())

/** Valida a sessão guardada; se a API não responde, tenta de novo quando ela voltar. */
function abrirSessao() {
  validarSessaoAoAbrir().catch(() => {
    /* API fora do ar: a sonda de saúde avisa quando voltar */
  })
}

aoApiVoltar(() => {
  if (obterSessao().fase === 'verificando') abrirSessao()
  void clienteDeConsultas.invalidateQueries()
})

abrirSessao()

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root ausente em index.html')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={clienteDeConsultas}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>
  </StrictMode>,
)

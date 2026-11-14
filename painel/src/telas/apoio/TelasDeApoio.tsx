import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { ehNaoEncontrado, ehSemPermissao } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import { EstadoAcordando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { buttonVariants } from '@/componentes/ui/button'
import { podeAbrir, type Area } from '@/dominio/papeis'

function VoltarAVisaoGeral() {
  return (
    <Link to="/" className={buttonVariants({ variant: 'outline' })}>
      Ir para a visão geral
    </Link>
  )
}

/** Limite de erro de cada rota: mostra a mensagem da API, nunca detalhe interno. */
export function ErroDaRota({ error, reset }: ErrorComponentProps) {
  const roteador = useRouter()
  const consultas = useQueryErrorResetBoundary()
  if (ehSemPermissao(error)) return <SemPermissao />
  if (ehNaoEncontrado(error)) return <RotaNaoEncontrada />
  return (
    <Painel className="max-w-2xl">
      <Modulo rotulo="Erro" semRecuo>
        <EstadoErro
          erro={error}
          aoTentarDeNovo={() => {
            consultas.reset()
            reset()
            void roteador.invalidate()
          }}
        />
      </Modulo>
    </Painel>
  )
}

export function RotaNaoEncontrada() {
  return (
    <Painel className="max-w-2xl">
      <Modulo rotulo="Não encontrado" semRecuo>
        <EstadoVazio titulo="Esta página não existe." acao={<VoltarAVisaoGeral />}>
          O endereço pode estar errado ou a máquina pode ter sido removida.
        </EstadoVazio>
      </Modulo>
    </Painel>
  )
}

export function SemPermissao() {
  return (
    <Painel className="max-w-2xl">
      <Modulo rotulo="Sem permissão" semRecuo>
        <EstadoVazio
          titulo="Seu papel não tem permissão para abrir esta área."
          acao={<VoltarAVisaoGeral />}
        >
          Se você precisa deste acesso, fale com um administrador.
        </EstadoVazio>
      </Modulo>
    </Painel>
  )
}

/** Protege uma rota por papel: quem não pode abrir vê "sem permissão", não a tela. */
export function ExigePapel({ area, children }: { area: Area; children: ReactNode }) {
  const sessao = useSessao()
  if (sessao.fase !== 'autenticada') return null
  return podeAbrir(sessao.usuario.papel, area) ? children : <SemPermissao />
}

/** Enquanto a sessão guardada é conferida com a API (que pode estar acordando). */
export function TelaVerificando() {
  return (
    <div className="px-4 py-3">
      <p className="mb-3 text-15 font-semibold tracking-tight" translate="no">
        PredictSpin
      </p>
      <Painel className="max-w-md">
        <Modulo rotulo="Sessão" semRecuo>
          <EstadoAcordandoOuCarregando />
        </Modulo>
      </Painel>
    </div>
  )
}

function EstadoAcordandoOuCarregando() {
  // EstadoAcordando lê a saúde da conexão: se a API responde, vira "conferindo" por um instante
  return <EstadoAcordando />
}

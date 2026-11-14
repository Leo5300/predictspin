import { Unplug } from 'lucide-react'
import type { ReactNode } from 'react'

import { ErroApi, ErroRede, mensagemDoErro } from '@/api/erros'
import { useSaude } from '@/api/saude'
import { Button } from '@/componentes/ui/button'
import { estadoDaConexao } from '@/dominio/conexao'
import { useSegundo } from '@/estado/relogio'
import { cn } from '@/lib/utils'

type PropsBase = { className?: string }

function Quadro({
  children,
  className,
  papel,
}: PropsBase & { children: ReactNode; papel?: 'status' | 'alert' }) {
  return (
    <div
      role={papel}
      className={cn(
        'flex min-h-24 flex-col items-start justify-center gap-2 p-3 text-13',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Vazio honesto: diz o que falta e, se houver, o que fazer. Nunca um número inventado. */
export function EstadoVazio({
  titulo,
  children,
  acao,
  className,
}: PropsBase & { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <Quadro className={className}>
      <p className="font-medium text-texto">{titulo}</p>
      {children ? <p className="max-w-prose text-apoio">{children}</p> : null}
      {acao}
    </Quadro>
  )
}

export function EstadoCarregando({
  rotulo = 'Carregando…',
  className,
}: PropsBase & { rotulo?: string }) {
  return (
    <Quadro papel="status" className={className}>
      <span className="flex items-center gap-2 text-apoio">
        <span
          aria-hidden="true"
          className="size-3 rounded-full border border-linha-forte border-t-texto motion-safe:animate-[girar_700ms_linear_infinite]"
        />
        {rotulo}
      </span>
    </Quadro>
  )
}

/** Erro de uma chamada: a mensagem e os campos do ErroResposta, nunca detalhe interno. */
export function EstadoErro({
  erro,
  aoTentarDeNovo,
  className,
}: PropsBase & { erro: unknown; aoTentarDeNovo?: () => void }) {
  if (erro instanceof ErroRede) {
    return <EstadoAcordando aoTentarDeNovo={aoTentarDeNovo} className={className} />
  }
  const campos = erro instanceof ErroApi ? erro.campos : []
  return (
    <Quadro papel="alert" className={className}>
      <p className="font-medium text-texto">{mensagemDoErro(erro)}</p>
      {campos.length > 0 ? (
        <ul className="text-apoio">
          {campos.map((c) => (
            <li key={`${c.campo}-${c.mensagem}`}>
              <span className="valor">{c.campo}</span>: {c.mensagem}
            </li>
          ))}
        </ul>
      ) : null}
      {aoTentarDeNovo ? <Button onClick={aoTentarDeNovo}>Tentar de novo</Button> : null}
    </Quadro>
  )
}

/**
 * "API acordando" é um estado próprio, diferente de "sem conexão": a API gratuita hiberna e leva
 * cerca de um minuto para voltar. Mostra a tentativa e quanto falta para a próxima.
 */
export function EstadoAcordando({
  aoTentarDeNovo,
  className,
}: PropsBase & { aoTentarDeNovo?: () => void }) {
  const saude = useSaude()
  const { epocaMs } = useSegundo()
  const estado = estadoDaConexao(saude, epocaMs)
  const falta = saude.proximaTentativaEmMs
    ? Math.max(0, Math.ceil((saude.proximaTentativaEmMs - epocaMs) / 1000))
    : null

  if (estado === 'sem_conexao') {
    return (
      <Quadro papel="alert" className={className}>
        <p className="flex items-center gap-2 font-medium text-texto">
          <Unplug aria-hidden="true" className="size-4" strokeWidth={1.5} />
          Sem conexão com a API
        </p>
        <p className="max-w-prose text-apoio">
          {saude.navegadorConectado
            ? 'A API não respondeu depois de várias tentativas. O painel continua tentando.'
            : 'Este computador está sem rede.'}
        </p>
        {aoTentarDeNovo ? <Button onClick={aoTentarDeNovo}>Tentar agora</Button> : null}
      </Quadro>
    )
  }

  return (
    <Quadro papel="status" className={className}>
      <p className="flex items-center gap-2 font-medium text-texto">
        <span
          aria-hidden="true"
          className="size-3 rounded-full border border-linha-forte border-t-texto motion-safe:animate-[girar_700ms_linear_infinite]"
        />
        API acordando
      </p>
      <p className="max-w-prose text-apoio">
        O servidor estava parado e leva cerca de 1 minuto para voltar.
        {saude.tentativa > 0 ? (
          <>
            {' '}
            Tentativa <span className="valor">{saude.tentativa}</span>
            {falta !== null ? (
              <>
                , próxima em <span className="valor">{falta} s</span>
              </>
            ) : null}
            .
          </>
        ) : null}
      </p>
    </Quadro>
  )
}

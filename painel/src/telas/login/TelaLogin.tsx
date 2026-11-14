import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { entrar } from '@/api/autenticacao'
import { ErroApi, ErroRede } from '@/api/erros'
import { useSessao } from '@/api/sessao'
import { EstadoAcordando } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { Button } from '@/componentes/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/componentes/ui/field'
import { Input } from '@/componentes/ui/input'
import { formatarPrazo } from '@/dominio/formato'
import { agoraMs, useSegundo } from '@/estado/relogio'
import { TelaVerificando } from '@/telas/apoio/TelasDeApoio'

const formulario = z.object({
  email: z.email('Informe um e-mail válido.').max(160, 'No máximo 160 caracteres.'),
  senha: z.string().min(1, 'Informe a senha.').max(72, 'No máximo 72 caracteres.'),
})

type Formulario = z.infer<typeof formulario>

type Falha =
  | { tipo: 'credenciais'; mensagem: string }
  | { tipo: 'bloqueado'; ateMs: number }
  | { tipo: 'rede' }
  | { tipo: 'outro'; mensagem: string }

/** Só caminhos internos servem de destino depois do login. */
function destinoSeguro(voltar: string | undefined): string {
  return voltar?.startsWith('/') && !voltar.startsWith('//') && !voltar.startsWith('/login')
    ? voltar
    : '/'
}

export function TelaLogin({ voltar }: { voltar: string | undefined }) {
  const sessao = useSessao()
  const { epocaMs } = useSegundo()
  const [falha, setFalha] = useState<Falha | null>(null)
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(formulario),
    defaultValues: { email: '', senha: '' },
  })

  const bloqueadoPorS =
    falha?.tipo === 'bloqueado' ? Math.max(0, Math.ceil((falha.ateMs - epocaMs) / 1000)) : 0
  const bloqueado = bloqueadoPorS > 0

  useEffect(() => {
    document.title = 'Entrar · PredictSpin'
  }, [])

  if (sessao.fase === 'verificando') return <TelaVerificando />
  if (sessao.fase === 'autenticada') return <Navigate to={destinoSeguro(voltar)} replace />

  const enviar = handleSubmit(async ({ email, senha }) => {
    setFalha(null)
    try {
      await entrar(email.trim(), senha)
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 429) {
        setFalha({ tipo: 'bloqueado', ateMs: agoraMs() + (erro.esperarS ?? 60) * 1000 })
      } else if (erro instanceof ErroApi && erro.status === 401) {
        setFalha({ tipo: 'credenciais', mensagem: erro.message })
        setFocus('senha')
      } else if (erro instanceof ErroRede) {
        setFalha({ tipo: 'rede' })
      } else {
        setFalha({
          tipo: 'outro',
          mensagem: erro instanceof ErroApi ? erro.message : 'Não foi possível entrar.',
        })
      }
    }
  })

  return (
    <main className="flex min-h-dvh flex-col gap-4 px-4 py-3 sm:p-8">
      <div>
        <p className="text-24 font-semibold tracking-tight" translate="no">
          PredictSpin
        </p>
        <p className="text-13 text-apoio">Centro de controle · monitoramento de vibração</p>
      </div>

      <Painel className="w-full max-w-sm">
        <Modulo rotulo="Entrar">
          <form onSubmit={(evento) => void enviar(evento)} noValidate>
            <FieldGroup>
              {sessao.aviso ? (
                <p
                  role="status"
                  className="border border-dashed border-linha-forte px-2 py-1 text-13 text-texto"
                >
                  {sessao.aviso}
                </p>
              ) : null}

              <Field data-invalid={errors.email ? true : undefined}>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  spellCheck={false}
                  autoCapitalize="none"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'erro-email' : undefined}
                  {...register('email')}
                />
                <FieldError id="erro-email">{errors.email?.message}</FieldError>
              </Field>

              <Field data-invalid={errors.senha ? true : undefined}>
                <FieldLabel htmlFor="senha">Senha</FieldLabel>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={errors.senha ? true : undefined}
                  aria-describedby={errors.senha ? 'erro-senha' : undefined}
                  {...register('senha')}
                />
                <FieldError id="erro-senha">{errors.senha?.message}</FieldError>
              </Field>

              {falha?.tipo === 'credenciais' || falha?.tipo === 'outro' ? (
                <p role="alert" className="text-13 text-alarme-texto">
                  {falha.mensagem}
                </p>
              ) : null}
              {bloqueado ? (
                <p role="alert" className="text-13 text-texto">
                  Muitas tentativas com falha. Tente de novo em{' '}
                  <span className="valor font-medium">{formatarPrazo(bloqueadoPorS)}</span>.
                </p>
              ) : null}

              <Button
                type="submit"
                variant="default"
                disabled={isSubmitting || bloqueado}
                className="w-full"
              >
                {isSubmitting ? 'Entrando…' : 'Entrar'}
              </Button>
            </FieldGroup>
          </form>
        </Modulo>
        {falha?.tipo === 'rede' ? (
          <Modulo rotulo="Conexão" semRecuo>
            <EstadoAcordando />
          </Modulo>
        ) : null}
      </Painel>
    </main>
  )
}

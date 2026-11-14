import { CircleAlert } from 'lucide-react'
import type * as React from 'react'

import { Label } from '@/componentes/ui/label'
import { cn } from '@/lib/utils'

/** Composição de formulário do shadcn (FieldGroup, Field, FieldLabel, FieldError), no visual do painel. */

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn('flex w-full flex-col gap-4', className)}
      {...props}
    />
  )
}

function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="field"
      className={cn('group/field flex w-full flex-col gap-1.5', className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn('group-data-[invalid=true]/field:text-texto', className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p data-slot="field-description" className={cn('text-12 text-apoio', className)} {...props} />
  )
}

function FieldError({ className, children, ...props }: React.ComponentProps<'p'>) {
  if (!children) return null
  return (
    // erro de formulário não é alarme da máquina: sem vermelho (ISA-101), com forma e texto
    <p
      role="alert"
      data-slot="field-error"
      className={cn('flex items-start gap-1.5 text-13 font-medium text-texto', className)}
      {...props}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  )
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel }

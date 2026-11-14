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
      className={cn('group-data-[invalid=true]/field:text-alarme-texto', className)}
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
    <p
      role="alert"
      data-slot="field-error"
      className={cn('text-13 text-alarme-texto', className)}
      {...props}
    >
      {children}
    </p>
  )
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel }

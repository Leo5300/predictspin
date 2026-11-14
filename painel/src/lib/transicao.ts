import type { CSSProperties } from 'react'

/**
 * Nome de transição do ponto: o módulo do ponto na tela da máquina e o cabeçalho da tela do ponto
 * usam o mesmo nome, e o navegador transforma um no outro ao abrir o ponto. O código do ponto é
 * livre (até 10 caracteres); só letras, números, hífen e sublinhado entram no nome.
 */
export function transicaoDoPonto(codigo: string): CSSProperties {
  return {
    viewTransitionName: `ponto-${codigo.replace(/[^A-Za-z0-9_-]/g, '_')}`,
    viewTransitionClass: 'modulo-ponto',
  }
}

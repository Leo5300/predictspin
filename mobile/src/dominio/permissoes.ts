/**
 * O que cada papel pode ver e fazer no app. Espelha a autorização da API (SegurancaConfig.java):
 * a API continua decidindo, e um 403 vira mensagem clara. O app só esconde o que o papel não pode.
 *
 *  - qualquer usuário autenticado: ver máquina, pontos, janelas, alarmes e reconhecer alarme;
 *  - ADMIN: suprimir e cancelar supressão de alarme;
 *  - qualquer usuário autenticado também vê as OS (a API só restringe assumir e concluir);
 *  - ADMIN e TECNICO: assumir e concluir OS, coleta;
 *  - só ADMIN: ver e ativar os modelos da IA (em Conta).
 */

export type Papel = 'ADMIN' | 'TECNICO' | 'OPERADOR'

export type Aba = 'maquina' | 'alarmes' | 'conta' | 'ordens' | 'coleta'

export type Acao =
  | 'reconhecer_alarme'
  | 'suprimir_alarme'
  | 'cancelar_supressao'
  | 'assumir_os'
  | 'concluir_os'
  | 'ver_modelos'
  | 'ativar_modelo'

const TODOS: readonly Papel[] = ['ADMIN', 'TECNICO', 'OPERADOR']

const PAPEIS_DA_ABA: Record<Aba, readonly Papel[]> = {
  maquina: TODOS,
  alarmes: TODOS,
  conta: TODOS,
  ordens: TODOS,
  coleta: ['ADMIN', 'TECNICO'],
}

const PAPEIS_DA_ACAO: Record<Acao, readonly Papel[]> = {
  reconhecer_alarme: TODOS,
  suprimir_alarme: ['ADMIN'],
  cancelar_supressao: ['ADMIN'],
  assumir_os: ['ADMIN', 'TECNICO'],
  concluir_os: ['ADMIN', 'TECNICO'],
  ver_modelos: ['ADMIN'],
  ativar_modelo: ['ADMIN'],
}

/** Abas que existem nesta versão do app. */
export const ABAS_DO_APP: readonly Aba[] = ['maquina', 'alarmes', 'ordens', 'coleta', 'conta']

export function ehPapel(valor: unknown): valor is Papel {
  return valor === 'ADMIN' || valor === 'TECNICO' || valor === 'OPERADOR'
}

export function podeVerAba(papel: Papel | null | undefined, aba: Aba): boolean {
  return ehPapel(papel) && PAPEIS_DA_ABA[aba].includes(papel)
}

export function pode(papel: Papel | null | undefined, acao: Acao): boolean {
  return ehPapel(papel) && PAPEIS_DA_ACAO[acao].includes(papel)
}

/** Abas que o papel enxerga, na ordem da barra. */
export function abasDoPapel(papel: Papel | null | undefined): Aba[] {
  return ABAS_DO_APP.filter((aba) => podeVerAba(papel, aba))
}

export const ROTULO_PAPEL: Record<Papel, string> = {
  ADMIN: 'Administrador',
  TECNICO: 'Técnico',
  OPERADOR: 'Operador',
}

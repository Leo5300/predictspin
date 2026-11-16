/**
 * O que cada papel pode abrir no painel. Espelha a autorização da API: ensaio, coleta e catálogos são
 * de ADMIN e TECNICO; usuários, só de ADMIN; o restante é de qualquer usuário autenticado.
 */

export type Papel = 'ADMIN' | 'TECNICO' | 'OPERADOR'

export type Area =
  | 'visao_geral'
  | 'maquina'
  | 'coleta'
  | 'ensaios'
  | 'diagnostico'
  | 'catalogos'
  | 'usuarios'
  | 'alarmes'

const PAPEIS_DA_AREA: Record<Area, readonly Papel[]> = {
  visao_geral: ['ADMIN', 'TECNICO', 'OPERADOR'],
  maquina: ['ADMIN', 'TECNICO', 'OPERADOR'],
  coleta: ['ADMIN', 'TECNICO'],
  ensaios: ['ADMIN', 'TECNICO'],
  diagnostico: ['ADMIN', 'TECNICO', 'OPERADOR'],
  // a API lista e cria itens de catálogo para ADMIN e TECNICO; renomear e desativar, só ADMIN
  catalogos: ['ADMIN', 'TECNICO'],
  usuarios: ['ADMIN'],
  alarmes: ['ADMIN', 'TECNICO', 'OPERADOR'],
}

export function podeAbrir(papel: Papel | null | undefined, area: Area): boolean {
  return papel !== null && papel !== undefined && PAPEIS_DA_AREA[area].includes(papel)
}

export const ROTULO_PAPEL_USUARIO: Record<Papel, string> = {
  ADMIN: 'Administrador',
  TECNICO: 'Técnico',
  OPERADOR: 'Operador',
}

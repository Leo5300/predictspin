/**
 * O que cada papel pode abrir no painel. Espelha a autorização da API: as rotas de ensaio e de
 * coleta são só de ADMIN e TECNICO; o restante é de qualquer usuário autenticado.
 */

export type Papel = 'ADMIN' | 'TECNICO' | 'OPERADOR'

export type Area = 'visao_geral' | 'maquina' | 'coleta' | 'ensaios'

const PAPEIS_DA_AREA: Record<Area, readonly Papel[]> = {
  visao_geral: ['ADMIN', 'TECNICO', 'OPERADOR'],
  maquina: ['ADMIN', 'TECNICO', 'OPERADOR'],
  coleta: ['ADMIN', 'TECNICO'],
  ensaios: ['ADMIN', 'TECNICO'],
}

export function podeAbrir(papel: Papel | null | undefined, area: Area): boolean {
  return papel !== null && papel !== undefined && PAPEIS_DA_AREA[area].includes(papel)
}

export const ROTULO_PAPEL_USUARIO: Record<Papel, string> = {
  ADMIN: 'Administrador',
  TECNICO: 'Técnico',
  OPERADOR: 'Operador',
}

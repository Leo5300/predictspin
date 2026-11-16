/**
 * ADAPTADOR ÚNICO de alarmes e ordens de serviço. As telas só conversam com este arquivo. Hoje a API
 * não tem regra de alarme nem rota de alerta e de ordem de serviço (as tabelas existem desde a V1,
 * sem rota): tudo aqui devolve "indisponível" e nenhuma rota é chamada. Ligar a API futura será trocar
 * o corpo destas funções; o contrato esperado está em docs/painel.md, seção "Contrato esperado para
 * alarmes, OS e referência".
 */

/** Estados de um alarme pela ISA-18.2. */
export type EstadoAlarme =
  'nao_reconhecido' | 'reconhecido' | 'normalizado_sem_reconhecimento' | 'suprimido'

export type Alarme = {
  id: number
  maquina: string
  /** Ponto (A, B, C) ou canal de onde veio. */
  origem: string
  metrica: string
  prioridade: 'atencao' | 'alarme'
  estado: EstadoAlarme
  ocorridoEm: string
  valor: number
  unidade: string
  /** O que fazer: na ISA-18.2, alarme sem ação definida é evento, não alarme. */
  acaoRecomendada: string
}

export type RetornoTecnico = 'confirmada' | 'rejeitada' | null

export type OrdemServico = {
  id: number
  numero: string
  maquina: string
  status: 'aberta' | 'em_andamento' | 'concluida' | 'cancelada'
  tipoFalha: string
  acaoRecomendada: string
  abertaEm: string
  retornoTecnico: RetornoTecnico
}

export type Resultado<T> = { disponivel: false; motivo: string } | { disponivel: true; itens: T[] }

export const MOTIVO_INDISPONIVEL =
  'A regra de alarme ainda não foi implantada na API: não há referência aprendida, alerta nem ordem de serviço para mostrar.'

export function listarAlarmes(): Promise<Resultado<Alarme>> {
  return Promise.resolve({ disponivel: false, motivo: MOTIVO_INDISPONIVEL })
}

export function listarOrdensDeServico(): Promise<Resultado<OrdemServico>> {
  return Promise.resolve({ disponivel: false, motivo: MOTIVO_INDISPONIVEL })
}

/** Reconhecer um alarme: hoje não há o que reconhecer. */
export function reconhecerAlarme(id: number): Promise<never> {
  return Promise.reject(new Error(`Alarme ${id}: a API ainda não tem rota de alerta.`))
}

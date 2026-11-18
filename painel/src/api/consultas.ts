/**
 * Consultas à API para o TanStack Query. Toda consulta de dado medido leva "simulado" verdadeiro
 * ou falso: dado real e dado simulado nunca se misturam.
 */
import { queryOptions, type QueryClient } from '@tanstack/react-query'

import type { Observacao } from '@/dominio/idade'
import { fimAlinhadoMs } from '@/dominio/periodos'

import { api, exigir } from './cliente'
import { ErroApi } from './erros'
import { janelaDaUltima, type Janela, type ModoRapido } from './tipos'

/** A consulta periódica, quando os eventos ao vivo não estão disponíveis. */
export const INTERVALO_DE_CONSULTA_MS = 5000

export type UltimaObservada = { janela: Janela; observacao: Observacao } | null

export const chaves = {
  maquinas: () => ['maquinas'] as const,
  maquina: (id: number) => ['maquina', id] as const,
  pontos: (maquinaId: number) => ['pontos', maquinaId] as const,
  dispositivos: (maquinaId: number, simulado: boolean) =>
    ['dispositivos', maquinaId, simulado] as const,
  ultimaJanela: (maquinaId: number, simulado: boolean) =>
    ['ultima-janela', maquinaId, simulado] as const,
  janelasRecentes: (maquinaId: number, simulado: boolean) =>
    ['janelas-recentes', maquinaId, simulado] as const,
  serie: (maquinaId: number, simulado: boolean, segundos: number, baldes: number) =>
    ['serie', maquinaId, simulado, segundos, baldes] as const,
  seriePeriodo: (maquinaId: number, simulado: boolean, de: string, ate: string, baldes: number) =>
    ['serie-periodo', maquinaId, simulado, de, ate, baldes] as const,
  janelasPeriodo: (maquinaId: number, simulado: boolean, de: string, ate: string) =>
    ['janelas-periodo', maquinaId, simulado, de, ate] as const,
  janelasPagina: (maquinaId: number, simulado: boolean, de: string, ate: string, pagina: number) =>
    ['janelas-pagina', maquinaId, simulado, de, ate, pagina] as const,
  modoRapido: (maquinaId: number) => ['modo-rapido', maquinaId] as const,
  ensaios: (maquinaId: number, simulado: boolean) => ['ensaios', maquinaId, simulado] as const,
}

export function consultaMaquinas() {
  return queryOptions({
    queryKey: chaves.maquinas(),
    queryFn: ({ signal }) =>
      exigir(api.GET('/api/v1/maquinas', { params: { query: { size: 200 } }, signal })),
    staleTime: 60_000,
  })
}

export function consultaMaquina(id: number) {
  return queryOptions({
    queryKey: chaves.maquina(id),
    queryFn: ({ signal }) =>
      exigir(api.GET('/api/v1/maquinas/{id}', { params: { path: { id } }, signal })),
    staleTime: 60_000,
  })
}

export function consultaPontos(maquinaId: number) {
  return queryOptions({
    queryKey: chaves.pontos(maquinaId),
    queryFn: async ({ signal }) => {
      const pagina = await exigir(
        api.GET('/api/v1/maquinas/{id}/pontos', {
          params: { path: { id: maquinaId }, query: { size: 200 } },
          signal,
        }),
      )
      return pagina.conteudo
    },
    staleTime: 5 * 60_000,
  })
}

export function consultaDispositivos(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chaves.dispositivos(maquinaId, simulado),
    queryFn: async ({ signal }) => {
      const pagina = await exigir(
        api.GET('/api/v1/maquinas/{id}/dispositivos', {
          params: { path: { id: maquinaId }, query: { simulado, size: 50 } },
          signal,
        }),
      )
      return pagina.conteudo
    },
    refetchInterval: 30_000,
  })
}

/**
 * Última janela da máquina, com a idade que ela tinha quando a resposta chegou. "Nenhuma janela
 * recebida" (404) não é erro: é o estado vazio.
 */
export function consultaUltimaJanela(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chaves.ultimaJanela(maquinaId, simulado),
    queryFn: async ({ signal }): Promise<UltimaObservada> => {
      try {
        const ultima = await exigir(
          api.GET('/api/v1/maquinas/{id}/ultima-janela', {
            params: { path: { id: maquinaId }, query: { simulado } },
            signal,
          }),
        )
        return {
          janela: janelaDaUltima(ultima),
          observacao: {
            idadeNaObservacaoS: ultima.segundos_desde_recebimento,
            observadoEmMs: performance.now(),
          },
        }
      } catch (erro) {
        if (erro instanceof ErroApi && erro.status === 404) return null
        throw erro
      }
    },
  })
}

/** Série agregada dos últimos "segundos", terminando agora (arredondado ao tamanho do intervalo). */
export function consultaSerieRecente(
  maquinaId: number,
  simulado: boolean,
  segundos: number,
  baldes: number,
) {
  return queryOptions({
    queryKey: chaves.serie(maquinaId, simulado, segundos, baldes),
    queryFn: ({ signal }) => {
      const ate = fimAlinhadoMs(Date.now(), segundos / baldes)
      return buscarSerie(maquinaId, simulado, ate - segundos * 1000, ate, baldes, signal)
    },
  })
}

export function consultaSeriePeriodo(
  maquinaId: number,
  simulado: boolean,
  deMs: number,
  ateMs: number,
  baldes: number,
) {
  const de = new Date(deMs).toISOString()
  const ate = new Date(ateMs).toISOString()
  return queryOptions({
    queryKey: chaves.seriePeriodo(maquinaId, simulado, de, ate, baldes),
    queryFn: ({ signal }) => buscarSerie(maquinaId, simulado, deMs, ateMs, baldes, signal),
  })
}

function buscarSerie(
  maquinaId: number,
  simulado: boolean,
  deMs: number,
  ateMs: number,
  baldes: number,
  signal: AbortSignal,
) {
  return exigir(
    api.GET('/api/v1/maquinas/{id}/serie', {
      params: {
        path: { id: maquinaId },
        query: {
          de: new Date(deMs).toISOString(),
          ate: new Date(ateMs).toISOString(),
          simulado,
          baldes,
        },
      },
      signal,
    }),
  )
}

const TAMANHO_DA_PAGINA = 200
const PAGINAS_MAXIMO = 10

/** Todas as janelas normais do período, da mais antiga para a mais nova (dados brutos do gráfico). */
export async function buscarJanelasDoPeriodo(
  maquinaId: number,
  simulado: boolean,
  deMs: number,
  ateMs: number,
  signal?: AbortSignal,
): Promise<Janela[]> {
  const janelas: Janela[] = []
  for (let page = 0; page < PAGINAS_MAXIMO; page++) {
    const pagina = await exigir(
      api.GET('/api/v1/maquinas/{id}/janelas', {
        params: {
          path: { id: maquinaId },
          query: {
            de: new Date(deMs).toISOString(),
            ate: new Date(ateMs).toISOString(),
            simulado,
            modo: 'normal',
            ordem: 'asc',
            page,
            size: TAMANHO_DA_PAGINA,
          },
        },
        signal,
      }),
    )
    janelas.push(...pagina.conteudo)
    if (page + 1 >= pagina.total_paginas) break
  }
  return janelas
}

export function consultaJanelasDoPeriodo(
  maquinaId: number,
  simulado: boolean,
  deMs: number,
  ateMs: number,
) {
  return queryOptions({
    queryKey: chaves.janelasPeriodo(
      maquinaId,
      simulado,
      new Date(deMs).toISOString(),
      new Date(ateMs).toISOString(),
    ),
    queryFn: ({ signal }) => buscarJanelasDoPeriodo(maquinaId, simulado, deMs, ateMs, signal),
  })
}

/** Chaves das consultas com período explícito: [nome, máquina, simulado, de, ate, ...]. */
const COM_PERIODO = new Set(['serie-periodo', 'janelas-periodo', 'janelas-pagina'])
/** Chaves "do agora" da máquina: [nome, máquina, simulado, ...]. */
const DO_AGORA = new Set(['serie', 'ultima-janela', 'janelas-recentes'])

/**
 * Decide se uma consulta precisa ser refeita depois de um evento "recuperacao" (janelas antigas que
 * chegaram depois de uma queda): as do agora sempre; as de período só se o período cruza [de, ate].
 * Assim o painel aberto não fica com lacuna depois de uma queda longa.
 */
export function afetadaPelaRecuperacao(
  chave: readonly unknown[],
  maquinaId: number,
  simulado: boolean,
  deIso: string,
  ateIso: string,
): boolean {
  const [nome, maquina, fonte, de, ate] = chave
  if (maquina !== maquinaId || fonte !== simulado || typeof nome !== 'string') return false
  if (DO_AGORA.has(nome)) return true
  if (!COM_PERIODO.has(nome) || typeof de !== 'string' || typeof ate !== 'string') return false
  return Date.parse(de) <= Date.parse(ateIso) && Date.parse(ate) >= Date.parse(deIso)
}

export function invalidarRecuperacao(
  cliente: QueryClient,
  maquinaId: number,
  simulado: boolean,
  deIso: string,
  ateIso: string,
) {
  return cliente.invalidateQueries({
    predicate: (consulta) =>
      afetadaPelaRecuperacao(consulta.queryKey, maquinaId, simulado, deIso, ateIso),
  })
}

export const LINHAS_POR_PAGINA = 15

/** Uma página da tabela de janelas do período (todas, normais e rápidas), mais recente primeiro. */
export function consultaPaginaDeJanelas(
  maquinaId: number,
  simulado: boolean,
  deMs: number,
  ateMs: number,
  pagina: number,
) {
  const de = new Date(deMs).toISOString()
  const ate = new Date(ateMs).toISOString()
  return queryOptions({
    queryKey: chaves.janelasPagina(maquinaId, simulado, de, ate, pagina),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/janelas', {
          params: {
            path: { id: maquinaId },
            query: { de, ate, simulado, ordem: 'desc', page: pagina, size: LINHAS_POR_PAGINA },
          },
          signal,
        }),
      ),
    placeholderData: (anterior) => anterior,
  })
}

export function consultaModoRapido(maquinaId: number) {
  return queryOptions({
    queryKey: chaves.modoRapido(maquinaId),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/modo-rapido', {
          params: { path: { id: maquinaId } },
          signal,
        }),
      ),
  })
}

export function ligarModoRapido(maquinaId: number): Promise<ModoRapido> {
  return exigir(
    api.POST('/api/v1/maquinas/{id}/modo-rapido', { params: { path: { id: maquinaId } } }),
  )
}

export function desligarModoRapido(maquinaId: number, manterVivo = false): Promise<ModoRapido> {
  return exigir(
    api.DELETE('/api/v1/maquinas/{id}/modo-rapido', {
      params: { path: { id: maquinaId } },
      keepalive: manterVivo,
    }),
  )
}

/** Ensaios da máquina (só ADMIN e TECNICO), mais recentes primeiro; para as faixas do gráfico. */
export function consultaEnsaios(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chaves.ensaios(maquinaId, simulado),
    queryFn: async ({ signal }) => {
      const pagina = await exigir(
        api.GET('/api/v1/maquinas/{id}/ensaios', {
          params: { path: { id: maquinaId }, query: { simulado, size: 200 } },
          signal,
        }),
      )
      return pagina.conteudo
    },
    staleTime: 30_000,
  })
}

/** Janelas mantidas em memória por máquina: os últimos 15 minutos, para sparklines e ao vivo. */
export const RECENTES_SEGUNDOS = 15 * 60
const RECENTES_MAXIMO = 1500

export function consultaJanelasRecentes(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chaves.janelasRecentes(maquinaId, simulado),
    queryFn: ({ signal }) => {
      const agora = Date.now()
      return buscarJanelasDoPeriodo(
        maquinaId,
        simulado,
        agora - RECENTES_SEGUNDOS * 1000,
        agora + 1000,
        signal,
      )
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })
}

/** Junta uma janela nova às recentes: sem repetir, em ordem de medição e só os últimos 15 min. */
export function anexarJanela(recentes: readonly Janela[] | undefined, nova: Janela): Janela[] {
  const lista = recentes ?? []
  if (lista.some((j) => j.id === nova.id)) return lista as Janela[]
  const instante = Date.parse(nova.medido_em)
  const corte = instante - RECENTES_SEGUNDOS * 1000
  const saida = lista.filter((j) => Date.parse(j.medido_em) >= corte)
  const ultimo = saida.at(-1)
  if (!ultimo || Date.parse(ultimo.medido_em) <= instante) {
    saida.push(nova)
  } else {
    saida.push(nova)
    saida.sort((a, b) => Date.parse(a.medido_em) - Date.parse(b.medido_em))
  }
  return saida.length > RECENTES_MAXIMO ? saida.slice(saida.length - RECENTES_MAXIMO) : saida
}

/** Registra no cache uma janela que acabou de chegar (por evento ou por consulta). */
export function registrarJanela(
  cliente: QueryClient,
  maquinaId: number,
  simulado: boolean,
  janela: Janela,
) {
  cliente.setQueryData<Janela[]>(chaves.janelasRecentes(maquinaId, simulado), (recentes) =>
    anexarJanela(recentes, janela),
  )
}

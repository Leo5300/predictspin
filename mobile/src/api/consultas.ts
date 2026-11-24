/**
 * Consultas à API para o TanStack Query e as ações sobre alarmes. Toda consulta de dado medido leva
 * "simulado" verdadeiro ou falso: dado real e dado simulado nunca se misturam.
 */
import { queryOptions } from '@tanstack/react-query'

import type { Observacao } from '@/dominio/idade'
import type { FiltroOrdens } from '@/dominio/ordens'
import {
  periodo,
  tendenciaDeJanelas,
  tendenciaDeSerie,
  type ChavePeriodo,
  type Tendencia,
} from '@/dominio/tendencia'

import { api, exigir } from './cliente'
import { ErroApi } from './erros'
import { agoraMonotonicoMs } from './relogio'
import { janelaDaUltima, type Alarme, type ConclusaoOrdem, type Janela, type OrdemServico } from './tipos'

/** A consulta periódica, enquanto os eventos ao vivo não estão disponíveis. */
export const INTERVALO_DE_CONSULTA_MS = 5000

/** A sparkline mostra os últimos 10 minutos em 60 intervalos de 10 s. */
export const MINUTOS_DA_SPARKLINE = 10
export const BALDES_DA_SPARKLINE = 60

export type UltimaObservada = { janela: Janela; observacao: Observacao } | null

export const chaves = {
  maquinas: () => ['maquinas'] as const,
  pontos: (maquinaId: number) => ['pontos', maquinaId] as const,
  ultimaJanela: (maquinaId: number, simulado: boolean) =>
    ['ultima-janela', maquinaId, simulado] as const,
  serieRecente: (maquinaId: number, simulado: boolean) =>
    ['serie-recente', maquinaId, simulado] as const,
  avaliacao: (maquinaId: number, simulado: boolean) => ['avaliacao', maquinaId, simulado] as const,
  limites: () => ['limites'] as const,
  alarmes: (simulado: boolean) => ['alarmes', simulado] as const,
  alarme: (id: number) => ['alarme', id] as const,
  tendencia: (maquinaId: number, simulado: boolean, chave: ChavePeriodo) =>
    ['tendencia', maquinaId, simulado, chave] as const,
  tendenciaEntre: (maquinaId: number, simulado: boolean, inicioS: number, fimS: number) =>
    ['tendencia-entre', maquinaId, simulado, inicioS, fimS] as const,
  ordens: (simulado: boolean, filtro?: FiltroOrdens) =>
    (filtro === undefined ? ['ordens', simulado] : ['ordens', simulado, filtro]) as readonly unknown[],
  ordem: (id: number) => ['ordem', id] as const,
}

/** A API devolve no máximo 200 janelas por página; 1 h de janelas de 5 s são 720. */
const JANELAS_POR_PAGINA = 200
const PAGINAS_MAXIMAS = 6

export type DadosDaTendencia = {
  inicioS: number
  fimS: number
  /** Uma tendência por ponto (as janelas e a série trazem todos os pontos de uma vez). */
  porPonto: (codigo: string) => Tendencia
}

/**
 * Tendência do período que termina agora: janelas normais até 1 h (em páginas, da mais antiga para a
 * mais nova), série agregada da API em 8 h e 24 h. Uma consulta serve os três pontos.
 */
export function consultaTendencia(maquinaId: number, simulado: boolean, chave: ChavePeriodo) {
  const escolhido = periodo(chave)
  return queryOptions({
    queryKey: chaves.tendencia(maquinaId, simulado, chave),
    queryFn: async ({ signal }): Promise<DadosDaTendencia> => {
      const ate = new Date()
      const de = new Date(ate.getTime() - escolhido.segundos * 1000)
      const limites = { inicioS: de.getTime() / 1000, fimS: ate.getTime() / 1000 }
      if (escolhido.fonte === 'agregado') {
        const serie = await exigir(
          api.GET('/api/v1/maquinas/{id}/serie', {
            params: {
              path: { id: maquinaId },
              query: { de: de.toISOString(), ate: ate.toISOString(), simulado, baldes: escolhido.baldes },
            },
            signal,
          }),
        )
        return { ...limites, porPonto: (codigo) => tendenciaDeSerie(serie, codigo) }
      }
      const janelas = await janelasNormais(maquinaId, simulado, de, ate, signal)
      return { ...limites, porPonto: (codigo) => tendenciaDeJanelas(janelas, codigo) }
    },
    refetchInterval: escolhido.fonte === 'brutos' ? 15_000 : 60_000,
  })
}

/** Janelas normais de um intervalo, em páginas de 200, da mais antiga para a mais nova. */
async function janelasNormais(
  maquinaId: number,
  simulado: boolean,
  de: Date,
  ate: Date,
  signal: AbortSignal,
): Promise<Janela[]> {
  const janelas: Janela[] = []
  for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina++) {
    const resposta = await exigir(
      api.GET('/api/v1/maquinas/{id}/janelas', {
        params: {
          path: { id: maquinaId },
          query: {
            de: de.toISOString(),
            ate: ate.toISOString(),
            simulado,
            modo: 'normal',
            ordem: 'asc',
            page: pagina,
            size: JANELAS_POR_PAGINA,
          },
        },
        signal,
      }),
    )
    janelas.push(...resposta.conteudo)
    if (pagina + 1 >= resposta.total_paginas) break
  }
  return janelas
}

/** Tendência de um intervalo fixo, curto (até 1 h): a OS mostra o ponto em volta da abertura. */
export function consultaTendenciaEntre(maquinaId: number, simulado: boolean, inicioS: number, fimS: number) {
  return queryOptions({
    queryKey: chaves.tendenciaEntre(maquinaId, simulado, inicioS, fimS),
    queryFn: async ({ signal }): Promise<DadosDaTendencia> => {
      const janelas = await janelasNormais(
        maquinaId,
        simulado,
        new Date(inicioS * 1000),
        new Date(fimS * 1000),
        signal,
      )
      return { inicioS, fimS, porPonto: (codigo) => tendenciaDeJanelas(janelas, codigo) }
    },
  })
}

/** OS da fonte em uso; "todas" não filtra o status (a API já põe abertas e em andamento primeiro). */
export function consultaOrdens(simulado: boolean, filtro: FiltroOrdens) {
  return queryOptions({
    queryKey: chaves.ordens(simulado, filtro),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/ordens-servico', {
          params: { query: { simulado, size: 100, ...(filtro === 'todas' ? {} : { status: filtro }) } },
          signal,
        }),
      ),
    refetchInterval: 30_000,
  })
}

export function consultaOrdem(id: number) {
  return queryOptions({
    queryKey: chaves.ordem(id),
    queryFn: ({ signal }) =>
      exigir(api.GET('/api/v1/ordens-servico/{id}', { params: { path: { id } }, signal })),
  })
}

export function assumirOrdem(id: number): Promise<OrdemServico> {
  return exigir(api.POST('/api/v1/ordens-servico/{id}/assumir', { params: { path: { id } } }))
}

export function concluirOrdem(id: number, corpo: ConclusaoOrdem): Promise<OrdemServico> {
  return exigir(api.POST('/api/v1/ordens-servico/{id}/concluir', { params: { path: { id } }, body: corpo }))
}

export function consultaMaquinas() {
  return queryOptions({
    queryKey: chaves.maquinas(),
    queryFn: ({ signal }) =>
      exigir(api.GET('/api/v1/maquinas', { params: { query: { size: 200 } }, signal })),
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
            observadoEmMs: agoraMonotonicoMs(),
          },
        }
      } catch (erro) {
        if (erro instanceof ErroApi && erro.status === 404) return null
        throw erro
      }
    },
  })
}

/** Série agregada dos últimos minutos, para as sparklines (RMS médio de cada intervalo). */
export function consultaSerieRecente(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chaves.serieRecente(maquinaId, simulado),
    queryFn: ({ signal }) => {
      const ate = new Date()
      const de = new Date(ate.getTime() - MINUTOS_DA_SPARKLINE * 60_000)
      return exigir(
        api.GET('/api/v1/maquinas/{id}/serie', {
          params: {
            path: { id: maquinaId },
            query: {
              de: de.toISOString(),
              ate: ate.toISOString(),
              simulado,
              baldes: BALDES_DA_SPARKLINE,
            },
          },
          signal,
        }),
      )
    },
    refetchInterval: 15_000,
  })
}

/** Avaliação da janela mais recente: estado, z, típico de cada medida, marcha e explicação. */
export function consultaAvaliacao(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chaves.avaliacao(maquinaId, simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/avaliacao', {
          params: { path: { id: maquinaId }, query: { simulado } },
          signal,
        }),
      ),
  })
}

/** Limites em uso (z de atenção e alarme, prazos de supressão); o app não escreve nenhum à mão. */
export function consultaLimites() {
  return queryOptions({
    queryKey: chaves.limites(),
    queryFn: ({ signal }) => exigir(api.GET('/api/v1/alarmes/limites', { signal })),
    staleTime: 5 * 60_000,
  })
}

/** Quantos alarmes a lista traz de uma vez (a API manda os não reconhecidos primeiro). */
const TAMANHO_DA_LISTA = 100

export function consultaAlarmes(simulado: boolean) {
  return queryOptions({
    queryKey: chaves.alarmes(simulado),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/alertas', {
          params: { query: { simulado, size: TAMANHO_DA_LISTA } },
          signal,
        }),
      ),
  })
}

export function consultaAlarme(id: number) {
  return queryOptions({
    queryKey: chaves.alarme(id),
    queryFn: ({ signal }) =>
      exigir(api.GET('/api/v1/alertas/{id}', { params: { path: { id } }, signal })),
  })
}

/** "Eu vi": não apaga nem conserta nada. Qualquer usuário. */
export function reconhecerAlarme(id: number): Promise<Alarme> {
  return exigir(api.POST('/api/v1/alertas/{id}/reconhecer', { params: { path: { id } } }))
}

/** Só ADMIN: motivo e prazo obrigatórios; volta sozinho ao fim do prazo. */
export function suprimirAlarme(id: number, motivo: string, minutos: number): Promise<Alarme> {
  return exigir(
    api.POST('/api/v1/alertas/{id}/suprimir', {
      params: { path: { id } },
      body: { motivo, minutos },
    }),
  )
}

export function cancelarSupressao(id: number): Promise<Alarme> {
  return exigir(api.POST('/api/v1/alertas/{id}/cancelar-supressao', { params: { path: { id } } }))
}

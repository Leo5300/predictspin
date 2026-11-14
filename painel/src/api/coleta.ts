/**
 * Chamadas da Coleta: ensaios, receita, eventos marcados, catálogos, plano e cobertura, exportação.
 * Tudo pelo cliente gerado do contrato; nenhum tipo escrito à mão.
 */
import { queryOptions } from '@tanstack/react-query'

import type { Condicao, Etapa } from '@/dominio/coleta'

import { api, exigir, URL_API } from './cliente'
import { ErroApi } from './erros'
import type { components } from './esquema'
import { tokenAtual } from './sessao'

type Esquemas = components['schemas']
export type ItemCatalogo = Esquemas['ItemCatalogoResposta']
export type EventoMarcado = Esquemas['EventoMarcadoResposta']
export type AlteracaoEnsaio = Esquemas['AlteracaoEnsaioResposta']
export type ResumoEnsaio = Esquemas['ResumoEnsaioResposta']
export type Cobertura = Esquemas['CoberturaResposta']
export type NovoEnsaio = Esquemas['NovoEnsaioRequisicao']
export type CorpoReceita = Esquemas['ReceitaRequisicao']
export type Motivo = Esquemas['NovoEventoMarcadoRequisicao']['motivo']
export type TipoCatalogo = 'materiais' | 'ferramentas'

export const chavesColeta = {
  ensaioAberto: (maquinaId: number) => ['ensaio-aberto', maquinaId] as const,
  ensaio: (id: number) => ['ensaio', id] as const,
  resumo: (id: number) => ['ensaio-resumo', id] as const,
  eventos: (id: number) => ['ensaio-eventos', id] as const,
  alteracoes: (id: number) => ['ensaio-alteracoes', id] as const,
  janelasDoEnsaio: (id: number) => ['ensaio-janelas', id] as const,
  lista: (maquinaId: number, filtros: FiltrosDeEnsaios) =>
    ['ensaios-lista', maquinaId, filtros] as const,
  ultimo: (maquinaId: number, simulado: boolean) => ['ensaio-ultimo', maquinaId, simulado] as const,
  cobertura: (maquinaId: number, simulado: boolean, meta: number, rotacoes: readonly number[]) =>
    ['cobertura', maquinaId, simulado, meta, rotacoes.join(',')] as const,
  catalogo: (tipo: TipoCatalogo, busca: string, ativos: boolean | null) =>
    ['catalogo', tipo, busca, ativos] as const,
}

/** Ensaio aberto na máquina (de qualquer fonte), ou nulo. */
export function consultaEnsaioAberto(maquinaId: number) {
  return queryOptions({
    queryKey: chavesColeta.ensaioAberto(maquinaId),
    queryFn: async ({ signal }) => {
      const pagina = await exigir(
        api.GET('/api/v1/maquinas/{id}/ensaios', {
          params: { path: { id: maquinaId }, query: { aberto: true, size: 1 } },
          signal,
        }),
      )
      return pagina.conteudo[0] ?? null
    },
  })
}

export function consultaEnsaio(id: number) {
  return queryOptions({
    queryKey: chavesColeta.ensaio(id),
    queryFn: ({ signal }) =>
      exigir(api.GET('/api/v1/ensaios/{id}', { params: { path: { id } }, signal })),
  })
}

export function consultaResumo(id: number) {
  return queryOptions({
    queryKey: chavesColeta.resumo(id),
    queryFn: ({ signal }) =>
      exigir(api.GET('/api/v1/ensaios/{id}/resumo', { params: { path: { id } }, signal })),
  })
}

export function consultaEventosMarcados(id: number) {
  return queryOptions({
    queryKey: chavesColeta.eventos(id),
    queryFn: async ({ signal }) =>
      (
        await exigir(
          api.GET('/api/v1/ensaios/{id}/eventos', {
            params: { path: { id }, query: { size: 200 } },
            signal,
          }),
        )
      ).conteudo,
  })
}

export function consultaAlteracoes(id: number) {
  return queryOptions({
    queryKey: chavesColeta.alteracoes(id),
    queryFn: async ({ signal }) =>
      (
        await exigir(
          api.GET('/api/v1/ensaios/{id}/alteracoes', {
            params: { path: { id }, query: { size: 200 } },
            signal,
          }),
        )
      ).conteudo,
  })
}

export type FiltrosDeEnsaios = {
  simulado: boolean
  etapa?: Etapa
  condicao?: Condicao
  material_id?: number
  ferramenta_id?: number
  aberto?: boolean
  descartado?: boolean
  pagina: number
}

export const ENSAIOS_POR_PAGINA = 20

export function consultaListaDeEnsaios(maquinaId: number, filtros: FiltrosDeEnsaios) {
  return queryOptions({
    queryKey: chavesColeta.lista(maquinaId, filtros),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/ensaios', {
          params: {
            path: { id: maquinaId },
            query: {
              simulado: filtros.simulado,
              etapa: filtros.etapa,
              condicao: filtros.condicao,
              material_id: filtros.material_id,
              ferramenta_id: filtros.ferramenta_id,
              aberto: filtros.aberto,
              descartado: filtros.descartado,
              page: filtros.pagina,
              size: ENSAIOS_POR_PAGINA,
            },
          },
          signal,
        }),
      ),
    placeholderData: (anterior) => anterior,
  })
}

/** O ensaio mais recente da fonte (para "repetir a receita da última gravação"). */
export function consultaUltimoEnsaio(maquinaId: number, simulado: boolean) {
  return queryOptions({
    queryKey: chavesColeta.ultimo(maquinaId, simulado),
    queryFn: async ({ signal }) => {
      const pagina = await exigir(
        api.GET('/api/v1/maquinas/{id}/ensaios', {
          params: { path: { id: maquinaId }, query: { simulado, size: 1 } },
          signal,
        }),
      )
      return pagina.conteudo[0] ?? null
    },
  })
}

export function consultaCobertura(
  maquinaId: number,
  simulado: boolean,
  meta: number,
  rotacoes: readonly number[],
) {
  return queryOptions({
    queryKey: chavesColeta.cobertura(maquinaId, simulado, meta, rotacoes),
    queryFn: ({ signal }) =>
      exigir(
        api.GET('/api/v1/maquinas/{id}/coleta/cobertura', {
          params: {
            path: { id: maquinaId },
            query: { simulado, meta, rotacoes: [...rotacoes] },
          },
          signal,
        }),
      ),
    placeholderData: (anterior) => anterior,
  })
}

export function consultaCatalogo(tipo: TipoCatalogo, busca = '', ativos: boolean | null = true) {
  return queryOptions({
    queryKey: chavesColeta.catalogo(tipo, busca, ativos),
    queryFn: async ({ signal }) => {
      const query = { busca: busca || undefined, ativos: ativos ?? undefined, size: 200 }
      const pagina =
        tipo === 'materiais'
          ? await exigir(api.GET('/api/v1/materiais', { params: { query }, signal }))
          : await exigir(api.GET('/api/v1/ferramentas', { params: { query }, signal }))
      return pagina
    },
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------- mutações

export function abrirEnsaio(maquinaId: number, corpo: NovoEnsaio) {
  return exigir(
    api.POST('/api/v1/maquinas/{id}/ensaios', { params: { path: { id: maquinaId } }, body: corpo }),
  )
}

export function encerrarEnsaio(id: number) {
  return exigir(api.POST('/api/v1/ensaios/{id}/encerrar', { params: { path: { id } } }))
}

export function descartarEnsaio(id: number) {
  return exigir(api.POST('/api/v1/ensaios/{id}/descartar', { params: { path: { id } } }))
}

export function corrigirReceita(id: number, corpo: CorpoReceita) {
  return exigir(
    api.PATCH('/api/v1/ensaios/{id}/receita', { params: { path: { id } }, body: corpo }),
  )
}

export function marcarEvento(id: number, corpo: Esquemas['NovoEventoMarcadoRequisicao']) {
  return exigir(api.POST('/api/v1/ensaios/{id}/eventos', { params: { path: { id } }, body: corpo }))
}

export function gravarPlano(maquinaId: number, rotacoes: number[]) {
  return exigir(
    api.PUT('/api/v1/maquinas/{id}/coleta/plano', {
      params: { path: { id: maquinaId } },
      body: { rotacoes_rpm: rotacoes },
    }),
  )
}

/** Cria o item; nome repetido (409) devolve o existente, que passa a ser o escolhido. */
export async function criarItemDoCatalogo(
  tipo: TipoCatalogo,
  nome: string,
  descricao?: string,
): Promise<{ item: ItemCatalogo; jaExistia: boolean }> {
  const corpo = { nome, descricao: descricao === '' ? undefined : descricao }
  const resultado =
    tipo === 'materiais'
      ? await api.POST('/api/v1/materiais', { body: corpo })
      : await api.POST('/api/v1/ferramentas', { body: corpo })
  if (resultado.response.status === 409) {
    const erro = resultado.error as Esquemas['ConflitoCatalogoResposta'] | undefined
    if (erro?.existente) return { item: erro.existente, jaExistia: true }
  }
  if (!resultado.response.ok || !resultado.data) {
    throw new ErroApi(resultado.response.status, resultado.error ?? null)
  }
  return { item: resultado.data, jaExistia: false }
}

export function renomearItem(tipo: TipoCatalogo, id: number, nome: string) {
  return tipo === 'materiais'
    ? exigir(api.PATCH('/api/v1/materiais/{id}', { params: { path: { id } }, body: { nome } }))
    : exigir(api.PATCH('/api/v1/ferramentas/{id}', { params: { path: { id } }, body: { nome } }))
}

export function desativarItem(tipo: TipoCatalogo, id: number) {
  return tipo === 'materiais'
    ? exigir(api.POST('/api/v1/materiais/{id}/desativar', { params: { path: { id } } }))
    : exigir(api.POST('/api/v1/ferramentas/{id}/desativar', { params: { path: { id } } }))
}

/**
 * Baixa o CSV dos ensaios com o token no cabeçalho (um link direto não levaria o token) e salva com o
 * nome que a API manda em Content-Disposition.
 */
export async function baixarCsvDosEnsaios(maquinaId: number, simulado: boolean): Promise<string> {
  const token = tokenAtual()
  const url = `${URL_API}/api/v1/ensaios/exportar.csv?simulado=${simulado}&maquina_id=${maquinaId}`
  const resposta = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!resposta.ok) {
    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      /* corpo sem JSON */
    }
    throw new ErroApi(resposta.status, (corpo as Esquemas['ErroResposta'] | null) ?? null)
  }
  const nome = nomeDoArquivo(resposta.headers.get('Content-Disposition')) ?? 'ensaios.csv'
  const blob = await resposta.blob()
  const endereco = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = endereco
  link.download = nome
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(endereco), 1000)
  return nome
}

/** filename="ensaios-20261114-120000-simulados.csv" → o nome. */
export function nomeDoArquivo(cabecalho: string | null): string | null {
  if (!cabecalho) return null
  const achado = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cabecalho)
  return achado?.[1] ? decodeURIComponent(achado[1]) : null
}

/** Todas as janelas de um ensaio, em ordem de medição (fita ao retomar, replay). */
export function consultaJanelasDoEnsaio(id: number) {
  return queryOptions({
    queryKey: chavesColeta.janelasDoEnsaio(id),
    queryFn: async ({ signal }) => {
      const janelas: Esquemas['JanelaResposta'][] = []
      for (let page = 0; page < 50; page++) {
        const pagina = await exigir(
          api.GET('/api/v1/ensaios/{id}/janelas', {
            params: { path: { id }, query: { page, size: 200 } },
            signal,
          }),
        )
        janelas.push(...pagina.conteudo)
        if (page + 1 >= pagina.total_paginas) break
      }
      return janelas
    },
  })
}

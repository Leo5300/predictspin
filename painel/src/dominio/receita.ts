/**
 * Receita do corte: material, ferramenta, avanço (mm/volta), profundidade de corte (mm), diâmetro da
 * peça (mm) e fluido de corte. Tudo opcional: o que fica em branco não aparece no resumo e não impede
 * a gravação.
 *
 * Validação (Zod), espelhando a API, com faixas largas que só pegam erro de digitação:
 *   avanço        0,01 a 2 mm/volta   (a API aceita ≥ 0; a faixa é só do painel, para não mudar o contrato)
 *   profundidade  0,05 a 10 mm        (a API recusa fora disso)
 *   diâmetro      1 a 500 mm          (a API recusa fora disso)
 * Valor dentro da faixa mas incomum gera AVISO, não bloqueio:
 *   avanço abaixo de 0,03 ou acima de 0,6 mm/volta; profundidade acima de 5 mm; diâmetro abaixo de
 *   5 mm ou acima de 300 mm.
 * Números aceitam vírgula ou ponto.
 */
import { z } from 'zod'

export type Fluido = 'seco' | 'emulsao' | 'oleo_integral' | 'outro'

export const ROTULO_FLUIDO: Record<Fluido, string> = {
  seco: 'Seco',
  emulsao: 'Emulsão',
  oleo_integral: 'Óleo integral',
  outro: 'Outro',
}

export type ItemDaReceita = { id: number; nome: string }

/** Receita como o formulário guarda: números ainda em texto (como foram digitados). */
export type Receita = {
  material: ItemDaReceita | null
  ferramenta: ItemDaReceita | null
  avanco: string
  profundidade: string
  diametro: string
  fluido: Fluido | null
}

export const RECEITA_VAZIA: Receita = {
  material: null,
  ferramenta: null,
  avanco: '',
  profundidade: '',
  diametro: '',
  fluido: null,
}

/** "0,15" ou "0.15" → 0.15; vazio → nulo; texto que não é número → NaN. */
export function lerDecimal(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null
  const limpo = texto.trim().replace(/\s/g, '')
  if (limpo === '') return null
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(limpo)) return Number.NaN
  return Number(limpo.replace(',', '.'))
}

export const FAIXAS = {
  avanco: { min: 0.01, max: 2, unidade: 'mm/volta', incomum: [0.03, 0.6] },
  profundidade: { min: 0.05, max: 10, unidade: 'mm', incomum: [0, 5] },
  diametro: { min: 1, max: 500, unidade: 'mm', incomum: [5, 300] },
} as const

type CampoNumerico = keyof typeof FAIXAS

const formatoFaixa = (n: number) => n.toLocaleString('pt-BR')

function campoNumerico(campo: CampoNumerico) {
  const faixa = FAIXAS[campo]
  return z.string().superRefine((texto, ctx) => {
    const valor = lerDecimal(texto)
    if (valor === null) return
    if (Number.isNaN(valor)) {
      ctx.addIssue({ code: 'custom', message: 'Use só números (vírgula ou ponto).' })
      return
    }
    if (valor < faixa.min || valor > faixa.max) {
      ctx.addIssue({
        code: 'custom',
        message: `Entre ${formatoFaixa(faixa.min)} e ${formatoFaixa(faixa.max)} ${faixa.unidade}.`,
      })
    }
  })
}

export const esquemaReceita = z.object({
  material: z.object({ id: z.number(), nome: z.string() }).nullable(),
  ferramenta: z.object({ id: z.number(), nome: z.string() }).nullable(),
  avanco: campoNumerico('avanco'),
  profundidade: campoNumerico('profundidade'),
  diametro: campoNumerico('diametro'),
  fluido: z.enum(['seco', 'emulsao', 'oleo_integral', 'outro']).nullable(),
})

export type ErrosDaReceita = Partial<Record<keyof Receita, string>>

export function validarReceita(receita: Receita): ErrosDaReceita {
  const resultado = esquemaReceita.safeParse(receita)
  if (resultado.success) return {}
  const erros: ErrosDaReceita = {}
  for (const problema of resultado.error.issues) {
    const campo = problema.path[0] as keyof Receita | undefined
    if (campo && !erros[campo]) erros[campo] = problema.message
  }
  return erros
}

/** Avisos de valor incomum (dentro da faixa): não bloqueiam. */
export function avisosDaReceita(receita: Receita): ErrosDaReceita {
  const avisos: ErrosDaReceita = {}
  for (const campo of ['avanco', 'profundidade', 'diametro'] as const) {
    const valor = lerDecimal(receita[campo])
    const faixa = FAIXAS[campo]
    if (valor === null || Number.isNaN(valor) || valor < faixa.min || valor > faixa.max) continue
    const [baixo, alto] = faixa.incomum
    if (valor < baixo || valor > alto) {
      avisos[campo] =
        `Valor incomum para ${campo === 'avanco' ? 'o avanço' : campo === 'profundidade' ? 'a profundidade' : 'o diâmetro'}. Confira antes de gravar.`
    }
  }
  return avisos
}

/** Corpo da receita para a API (snake_case); campos em branco ficam de fora. */
export function receitaParaApi(receita: Receita): {
  material_id?: number
  ferramenta_id?: number
  avanco_alvo?: number
  profundidade_corte_mm?: number
  diametro_peca_mm?: number
  fluido_corte?: Fluido
} {
  const numero = (texto: string) => {
    const v = lerDecimal(texto)
    return v === null || Number.isNaN(v) ? undefined : v
  }
  const corpo: ReturnType<typeof receitaParaApi> = {}
  if (receita.material) corpo.material_id = receita.material.id
  if (receita.ferramenta) corpo.ferramenta_id = receita.ferramenta.id
  const avanco = numero(receita.avanco)
  if (avanco !== undefined) corpo.avanco_alvo = avanco
  const profundidade = numero(receita.profundidade)
  if (profundidade !== undefined) corpo.profundidade_corte_mm = profundidade
  const diametro = numero(receita.diametro)
  if (diametro !== undefined) corpo.diametro_peca_mm = diametro
  if (receita.fluido) corpo.fluido_corte = receita.fluido
  return corpo
}

/** Linhas do resumo: só o que foi preenchido. */
export function resumoDaReceita(receita: Receita): { rotulo: string; valor: string }[] {
  const linhas: { rotulo: string; valor: string }[] = []
  const numero = (texto: string, unidade: string) => {
    const v = lerDecimal(texto)
    return v === null || Number.isNaN(v) ? null : `${v.toLocaleString('pt-BR')} ${unidade}`
  }
  if (receita.material) linhas.push({ rotulo: 'Material', valor: receita.material.nome })
  if (receita.ferramenta) linhas.push({ rotulo: 'Ferramenta', valor: receita.ferramenta.nome })
  const avanco = numero(receita.avanco, 'mm/volta')
  if (avanco) linhas.push({ rotulo: 'Avanço', valor: avanco })
  const profundidade = numero(receita.profundidade, 'mm')
  if (profundidade) linhas.push({ rotulo: 'Profundidade', valor: profundidade })
  const diametro = numero(receita.diametro, 'mm')
  if (diametro) linhas.push({ rotulo: 'Diâmetro', valor: diametro })
  if (receita.fluido) linhas.push({ rotulo: 'Fluido', valor: ROTULO_FLUIDO[receita.fluido] })
  return linhas
}

/** Receita a partir de um ensaio da API ("repetir a receita da última gravação"). */
export function receitaDoEnsaio(ensaio: {
  material_item?: ItemDaReceita | null
  ferramenta_item?: ItemDaReceita | null
  avanco_alvo?: number | null
  profundidade_corte_mm?: number | null
  diametro_peca_mm?: number | null
  fluido_corte?: Fluido | null
}): Receita {
  const texto = (v: number | null | undefined) =>
    v === null || v === undefined ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  return {
    material: ensaio.material_item ?? null,
    ferramenta: ensaio.ferramenta_item ?? null,
    avanco: texto(ensaio.avanco_alvo),
    profundidade: texto(ensaio.profundidade_corte_mm),
    diametro: texto(ensaio.diametro_peca_mm),
    fluido: ensaio.fluido_corte ?? null,
  }
}

export function receitaVazia(receita: Receita): boolean {
  return resumoDaReceita(receita).length === 0
}

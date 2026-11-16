/**
 * Nomes do catálogo (material e ferramenta). A comparação é a mesma da API (NomeNormalizado.java):
 * minúsculas, sem acento, sem pontuação e com os espaços colapsados. A similaridade serve para
 * perguntar "parecido com Aço SAE 1045 — é esse?" antes de criar um item novo; a lista é pequena e o
 * cálculo fica no painel.
 */

export function normalizarNome(nome: string | null | undefined): string {
  if (!nome) return ''
  return nome
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Nome como será exibido: espaços das pontas fora e os do meio colapsados. */
export function nomeDeExibicao(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ')
}

/** Distância de edição (Levenshtein) entre dois textos. */
export function distanciaDeEdicao(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      atual[j] = Math.min(
        (atual[j - 1] ?? 0) + 1,
        (anterior[j] ?? 0) + 1,
        (anterior[j - 1] ?? 0) + custo,
      )
    }
    anterior = atual
  }
  return anterior[b.length] ?? 0
}

/** Pares de letras seguidas de um texto (para o coeficiente de Dice). */
function bigramas(texto: string): Map<string, number> {
  const saida = new Map<string, number>()
  const limpo = texto.replace(/ /g, '')
  for (let i = 0; i < limpo.length - 1; i++) {
    const par = limpo.slice(i, i + 2)
    saida.set(par, (saida.get(par) ?? 0) + 1)
  }
  return saida
}

/**
 * Similaridade de 0 a 1 entre dois nomes, já normalizados por dentro. Combina:
 * - pares de letras em comum (Dice): pega palavras trocadas de lugar e abreviações ("aco 1045" e
 *   "aço SAE 1045");
 * - distância de edição relativa: pega erros de digitação ("alumnio" e "alumínio");
 * - um nome contido no outro, cobrindo ao menos metade dele ("sae 1045" em "aço SAE 1045").
 * Vale o maior dos três.
 */
export function similaridade(a: string, b: string): number {
  const x = normalizarNome(a)
  const y = normalizarNome(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const bx = bigramas(x)
  const by = bigramas(y)
  let comum = 0
  let total = 0
  for (const [par, n] of bx) {
    comum += Math.min(n, by.get(par) ?? 0)
    total += n
  }
  for (const n of by.values()) total += n
  const dice = total > 0 ? (2 * comum) / total : 0
  const edicao = 1 - distanciaDeEdicao(x, y) / Math.max(x.length, y.length)
  const menor = x.length <= y.length ? x : y
  const maior = x.length <= y.length ? y : x
  // contido só conta se o menor cobre pelo menos metade do maior ("aço 4" não é "aço 4340 temperado")
  const contido =
    menor.length >= 3 && maior.includes(menor) && menor.length / maior.length >= 0.5 ? 0.75 : 0
  return Math.max(dice, edicao, contido)
}

/** A partir daqui um item do catálogo é sugerido como "parecido". */
export const LIMIAR_PARECIDO = 0.55

export type ItemComNome = { id: number; nome: string; ativo?: boolean }

/**
 * Itens que batem com o texto digitado: primeiro o igual pelo nome normalizado (se houver), depois
 * os que contêm o texto, e por fim os parecidos, do mais parecido para o menos. No máximo `limite`.
 */
export function buscarNoCatalogo<T extends ItemComNome>(
  texto: string,
  itens: readonly T[],
  limite = 6,
): { igual: T | null; contem: T[]; parecidos: T[] } {
  const procurado = normalizarNome(texto)
  const ativos = itens.filter((i) => i.ativo !== false)
  if (!procurado) return { igual: null, contem: ativos.slice(0, limite), parecidos: [] }
  const igual = ativos.find((i) => normalizarNome(i.nome) === procurado) ?? null
  const contem = ativos.filter((i) => i !== igual && normalizarNome(i.nome).includes(procurado))
  const jaListados = new Set<T>([...(igual ? [igual] : []), ...contem])
  const parecidos = ativos
    .filter((i) => !jaListados.has(i))
    .map((i) => ({ item: i, nota: similaridade(procurado, i.nome) }))
    .filter((p) => p.nota >= LIMIAR_PARECIDO)
    .sort((p, q) => q.nota - p.nota)
    .map((p) => p.item)
  return {
    igual,
    contem: contem.slice(0, limite),
    parecidos: parecidos.slice(0, Math.max(0, limite - contem.length)),
  }
}

/** Pares de itens do catálogo que parecem o mesmo (aviso no Diagnóstico). */
export function paresParecidos<T extends ItemComNome>(itens: readonly T[], limiar = 0.8): [T, T][] {
  const pares: [T, T][] = []
  for (let i = 0; i < itens.length; i++) {
    for (let j = i + 1; j < itens.length; j++) {
      const a = itens[i]
      const b = itens[j]
      if (a && b && similaridade(a.nome, b.nome) >= limiar) pares.push([a, b])
    }
  }
  return pares
}

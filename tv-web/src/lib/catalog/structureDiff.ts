/**
 * Reconciliação da estrutura de uma lista numa atualização (feature 038,
 * FR-024/FR-028, `logic/atualizacao-sem-esfriar.md` §2).
 *
 * Função pura: compara as categorias já gravadas na geração ativa com as que a
 * atualização acabou de ler e diz o que manter (com os dados novos), o que
 * acrescentar e o que remover. Nunca compara categorias de seções diferentes:
 * o `category_id` do Xtream se repete entre canais, filmes e séries.
 */

import type { CategoryKind } from './db'

/** Chave de casamento: id do provedor quando existe (Xtream), senão o nome declarado (M3U). */
export function categoryMatchKey(providerCategoryId: string | undefined, name: string | undefined): string {
  return providerCategoryId !== undefined ? `p:${providerCategoryId}` : `n:${name ?? ''}`
}

export interface ExistingCategory {
  id: number
  kind: CategoryKind
  matchKey: string
}

export interface IncomingCategory {
  kind: CategoryKind
  matchKey: string
  name?: string
  /** Posição de exibição que a atualização declarou. */
  position: number
  declaredCount?: number
}

export interface KeptCategory {
  id: number
  incoming: IncomingCategory
}

export interface StructureDiff {
  keep: KeptCategory[]
  add: IncomingCategory[]
  /** Ids locais das categorias que a fonte não declara mais. */
  remove: number[]
}

export function diffCategories(
  existing: readonly ExistingCategory[],
  incoming: readonly IncomingCategory[],
): StructureDiff {
  // Só a primeira categoria de cada (seção, chave) casa; repetidas vão embora.
  const byKey = new Map<string, ExistingCategory>()
  const duplicates: number[] = []
  for (const category of existing) {
    const key = `${category.kind}|${category.matchKey}`
    if (byKey.has(key)) duplicates.push(category.id)
    else byKey.set(key, category)
  }

  const keep: KeptCategory[] = []
  const add: IncomingCategory[] = []
  const used = new Set<number>()
  for (const candidate of incoming) {
    const match = byKey.get(`${candidate.kind}|${candidate.matchKey}`)
    if (match && !used.has(match.id)) {
      used.add(match.id)
      keep.push({ id: match.id, incoming: candidate })
    } else {
      add.push(candidate)
    }
  }

  const remove = [
    ...[...byKey.values()].filter((category) => !used.has(category.id)).map((category) => category.id),
    ...duplicates,
  ]
  return { keep, add, remove }
}

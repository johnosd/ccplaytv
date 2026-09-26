/**
 * Busca local no catálogo já salvo no aparelho (feature 017).
 *
 * Nunca toca rede: lê só `channels` da geração ativa e a estrutura
 * `categories`. Ver `sdd/specs/017-busca-local-catalogo/logic/busca-local.md`
 * para o contrato completo (normalização, cobertura, ordenação).
 */

import { db, type CatalogDb, type CatalogRecord } from './db'
import { listAllOfKind, listCategories } from './catalogRepository'

/** Tipos pesquisáveis — cada seção pesquisa só o seu (FR-002). Episódio fica de fora. */
export type SearchableKind = 'channel' | 'movie' | 'series'

/** Abaixo disto (termo normalizado), nenhuma busca acontece (FR-005). */
export const SEARCH_MIN_CHARS = 3

export interface SearchIndexEntry {
  record: CatalogRecord
  /** `normalizeForSearch(record.name)`, calculado uma vez ao montar o índice. */
  normalizedName: string
}

export interface SearchIndex {
  entries: SearchIndexEntry[]
  /** Categorias do tipo cujo conteúdo já está no aparelho (FR-014). */
  coveredCategories: number
  /** Todas as categorias do tipo na geração ativa (FR-014). */
  totalCategories: number
}

/** Minúsculas, sem acentos/diacríticos, espaços das pontas removidos e internos colapsados (FR-007). */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Monta o índice a partir de registros já lidos — puro, sem banco. */
export function buildSearchIndex(
  records: CatalogRecord[],
  coverage: { coveredCategories: number; totalCategories: number },
): SearchIndex {
  return {
    entries: records.map((record) => ({ record, normalizedName: normalizeForSearch(record.name) })),
    coveredCategories: coverage.coveredCategories,
    totalCategories: coverage.totalCategories,
  }
}

/**
 * Categoria coberta = conteúdo já em `channels` (D-003/FR-024 do plano da
 * feature 017): `eager` sempre; `on_demand`/`stored` só depois de abertas
 * (`itemsFetchedAt` carimbado). `stored` nunca aberta NÃO conta — o
 * conteúdo guardado ainda não é registro de catálogo.
 */
function isCovered(category: { fetchMode: string; itemsFetchedAt?: number }): boolean {
  return category.fetchMode === 'eager' || category.itemsFetchedAt !== undefined
}

/**
 * Lê do aparelho tudo o que é pesquisável de um tipo na geração ativa e a
 * cobertura (quantas categorias do tipo já têm conteúdo no aparelho).
 */
export async function loadSearchIndex(
  sourceId: string,
  kind: SearchableKind,
  database: CatalogDb = db,
): Promise<SearchIndex> {
  const [records, categories] = await Promise.all([
    listAllOfKind(sourceId, kind, database),
    listCategories(sourceId, kind, database),
  ])
  const coveredCategories = categories.filter(isCovered).length
  return buildSearchIndex(records, { coveredCategories, totalCategories: categories.length })
}

/**
 * Filtra e ordena por termo — prefixo primeiro, resto depois, cada grupo
 * alfabético (FR-012 da feature 018). SEMPRE aplica o filtro (não decide
 * sozinha se deve rodar); quem chama decide quando usar isto vs. mostrar a
 * lista sem filtro (busca inativa, ou termo abaixo de `SEARCH_MIN_CHARS`).
 * Genérica: qualquer tipo com um nome extraível — usada tanto para filtrar
 * itens já carregados de uma categoria/Favoritos quanto os itens agregados
 * de "Todos" (`logic/busca-por-categoria.md` §2/§7 da feature 018).
 */
export function searchWithinItems<T>(items: T[], term: string, nameOf: (item: T) => string): T[] {
  const normalizedTerm = normalizeForSearch(term)

  interface Scored {
    item: T
    normalizedName: string
  }

  const scored: Scored[] = items.map((item) => ({ item, normalizedName: normalizeForSearch(nameOf(item)) }))
  const hits = scored.filter((entry) => entry.normalizedName.includes(normalizedTerm))
  const starts = hits.filter((entry) => entry.normalizedName.startsWith(normalizedTerm))
  const rest = hits.filter((entry) => !entry.normalizedName.startsWith(normalizedTerm))

  const byName = (a: Scored, b: Scored) =>
    a.normalizedName.localeCompare(b.normalizedName) || nameOf(a.item).localeCompare(nameOf(b.item))

  return [...starts.sort(byName), ...rest.sort(byName)].map((entry) => entry.item)
}

/**
 * Resultados de um termo: `[]` abaixo de `SEARCH_MIN_CHARS`; senão, os
 * registros cujo nome normalizado contém o termo normalizado — primeiro os
 * que começam com ele, depois os demais, cada grupo em ordem alfabética
 * (FR-005/FR-007/FR-010 da feature 017). Wrapper fino sobre
 * `searchWithinItems` (feature 018, D-010) — mesma assinatura pública de
 * sempre, não duplica a regra de ordenação.
 */
export function searchIndex(index: SearchIndex, term: string): CatalogRecord[] {
  if (normalizeForSearch(term).length < SEARCH_MIN_CHARS) return []
  return searchWithinItems(
    index.entries.map((entry) => entry.record),
    term,
    (record) => record.name,
  )
}

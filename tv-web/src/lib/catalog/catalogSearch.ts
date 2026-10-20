/**
 * Busca local no catálogo já salvo no aparelho (feature 017).
 *
 * Nunca toca rede: lê só `channels` da geração ativa e a estrutura
 * `categories`. Ver `sdd/specs/017-busca-local-catalogo/logic/busca-local.md`
 * para o contrato completo (normalização, cobertura, ordenação).
 */

import { db, type CatalogDb, type CatalogRecord } from './db'
import { listAllOfKind } from './catalogRepository'
import { listVisibleCategories } from './categoryAccess'
import { normalizeForSearch } from './adultCategory'
import { createSliceClock, forEachInSlices, mapInSlices, type SliceOptions } from '../slices'

/** Tipos pesquisáveis — cada seção pesquisa só o seu (FR-002). Episódio fica de fora. */
export type SearchableKind = 'channel' | 'movie' | 'series'

/** Abaixo disto (termo normalizado), nenhuma busca acontece (FR-005). */
export const SEARCH_MIN_CHARS = 3

export interface SearchIndexEntry {
  readonly record: CatalogRecord
  /** `normalizeForSearch(record.name)`, calculado uma vez, na primeira leitura. */
  readonly normalizedName: string
}

export interface SearchIndex {
  entries: SearchIndexEntry[]
  /** Categorias do tipo cujo conteúdo já está no aparelho (FR-014). */
  coveredCategories: number
  /** Todas as categorias do tipo na geração ativa (FR-014). */
  totalCategories: number
}

/** Mantém somente os campos usados por busca, ordenação e cards; URLs e
 * headers de reprodução não ficam duplicados no índice derivado. */
export function compactSearchRecord(record: CatalogRecord): CatalogRecord {
  return {
    id: record.id,
    sourceId: record.sourceId,
    generation: record.generation,
    kind: record.kind,
    categoryId: record.categoryId,
    categoryPosition: record.categoryPosition,
    groupOrder: record.groupOrder,
    name: record.name,
    originalName: record.originalName,
    group: record.group,
    providerStreamId: record.providerStreamId,
    seriesId: record.seriesId,
    iconUrl: record.iconUrl,
    year: record.year,
    addedAt: record.addedAt,
    providerRating: record.providerRating,
    providerGenres: record.providerGenres,
    providerBackdropUrl: record.providerBackdropUrl,
    epgChannelId: record.epgChannelId,
    archiveDays: record.archiveDays,
    hasPlayback: record.hasPlayback ?? (Boolean(record.directUrl) || Boolean(record.providerStreamId)),
  }
}

// Minúsculas, sem acentos, espaços colapsados (FR-007). Mora no módulo puro desde a feature 067 (sem ciclo com `db.ts`).
export { normalizeForSearch }

/**
 * Entrada do índice com o nome normalizado calculado **só quando lido**
 * (feature 039, T018): "Todos" monta o índice de um tipo inteiro (31 mil
 * filmes na lista de referência) e nunca lê este campo — normalizar tudo de
 * saída custava ~150 ms com CPU 4×. Mesmo formato de `SearchIndexEntry`.
 */
class LazySearchIndexEntry implements SearchIndexEntry {
  readonly record: CatalogRecord
  private normalized: string | undefined
  constructor(record: CatalogRecord) {
    this.record = record
  }
  get normalizedName(): string {
    // Pelo cache do registro: a busca filtra os registros por ele, então um cálculo serve aos dois (feature 084).
    this.normalized ??= normalizedNameOf(this.record, recordName)
    return this.normalized
  }
}

/** Monta o índice a partir de registros já lidos — puro, sem banco. */
export function buildSearchIndex(
  records: CatalogRecord[],
  coverage: { coveredCategories: number; totalCategories: number },
): SearchIndex {
  return {
    entries: records.map((record) => new LazySearchIndexEntry(record)),
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
export function isCovered(category: { fetchMode: string; itemsFetchedAt?: number }): boolean {
  return category.fetchMode === 'eager' || category.itemsFetchedAt !== undefined
}

/** Feature 084: montagem do índice em fatias, sem tarefa longa na tela da TV. */
export interface LoadSearchIndexOptions extends SliceOptions {
  /** Calcula o nome normalizado de cada entrada durante a montagem, em fatias (busca global: a 1ª tecla não normaliza tudo). */
  normalize?: boolean
}

/**
 * Lê do aparelho tudo o que é pesquisável de um tipo na geração ativa e a
 * cobertura (quantas categorias do tipo já têm conteúdo no aparelho).
 * Feature 084: em fatias que cedem a vez à interface e podem ser canceladas (`signal`); mesmo resultado de antes.
 */
export async function loadSearchIndex(
  sourceId: string,
  kind: SearchableKind,
  database: CatalogDb = db,
  options: LoadSearchIndexOptions = {},
): Promise<SearchIndex> {
  const clock = createSliceClock(options)
  const categories = await listVisibleCategories(sourceId, kind, database)
  const compact = await mapInSlices(await listAllOfKind(sourceId, kind, database, clock), compactSearchRecord, clock)
  const entries = await mapInSlices(compact, (record): SearchIndexEntry => new LazySearchIndexEntry(record), clock)
  // Aquece, em fatias, o nome normalizado: o cálculo da entrada preenche também o cache do registro (ver o getter).
  if (options.normalize) await forEachInSlices(entries, (entry) => void entry.normalizedName, clock)
  return { entries, coveredCategories: categories.filter(isCovered).length, totalCategories: categories.length }
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
/**
 * Nome normalizado por item, reaproveitado entre teclas (feature 039, T018):
 * digitar em "Todos" renormalizava ~31 mil nomes a cada tecla. Guarda o nome
 * cru junto — se ele mudar, recalcula. Só objetos entram (chave de WeakMap).
 */
const normalizedByItem = new WeakMap<object, { raw: string; normalized: string }>()

function normalizedNameOf<T>(item: T, nameOf: (item: T) => string): string {
  const raw = nameOf(item)
  if (typeof item !== 'object' || item === null) return normalizeForSearch(raw)
  const cached = normalizedByItem.get(item)
  if (cached && cached.raw === raw) return cached.normalized
  const normalized = normalizeForSearch(raw)
  normalizedByItem.set(item, { raw, normalized })
  return normalized
}

const recordName = (record: CatalogRecord): string => record.name

/** Calcula (e guarda) o nome normalizado de um item, para a 1ª busca por ele não pagar por isso (feature 084). */
export function warmNormalizedName<T>(item: T, nameOf: (item: T) => string): string {
  return normalizedNameOf(item, nameOf)
}

/** Mesma ordem de `a.localeCompare(b)` sem argumentos (localidade e opções padrão), sem recriar o colador a cada comparação. */
const compareText = new Intl.Collator().compare

export function searchWithinItems<T>(items: T[], term: string, nameOf: (item: T) => string): T[] {
  const normalizedTerm = normalizeForSearch(term)

  interface Scored {
    item: T
    normalizedName: string
  }

  const hits: Scored[] = []
  for (const item of items) {
    const normalizedName = normalizedNameOf(item, nameOf)
    if (normalizedName.includes(normalizedTerm)) hits.push({ item, normalizedName })
  }
  const starts = hits.filter((entry) => entry.normalizedName.startsWith(normalizedTerm))
  const rest = hits.filter((entry) => !entry.normalizedName.startsWith(normalizedTerm))

  const byName = (a: Scored, b: Scored) =>
    compareText(a.normalizedName, b.normalizedName) || compareText(nameOf(a.item), nameOf(b.item))

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

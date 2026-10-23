/**
 * Leitura e remoção do formato comprimido em pedaços (feature 082, `logic/formato-comprimido.md` §5). A gravação fica em
 * `blockWrite.ts`.
 *
 * Regra: a parte de banco (cabeçalho, `bulkGet` dos pedaços) vem antes; descomprimir vem **depois**, nunca dentro de uma
 * transação aberta. O cache guarda pedaços decodificados, com teto em itens (D-008), pela `revision` de quem gravou —
 * pedaço de gravação anterior nunca é servido.
 */
import type { BlockItem, BlockShared, CatalogDb, CatalogRecord, CategoryBlockRecord, CategoryKind } from './db'
import { categoryChunks, IDENTITY_CHUNK, type CategoryChunkRecord } from './chunkTables'
import { BLOCK_CHUNK_ITEMS, decodeBlockChunk, decodeIdentityIndex, type IdentityIndex } from './blockCodec'

/** Teto de itens decodificados em memória: ~460 B de heap por item medidos na TV → ~14 MiB (D-008, T013). */
export const CHUNK_CACHE_MAX_ITEMS = 30_000

/** O que localiza os itens de uma categoria (cabeçalho do bloco ou a própria categoria). */
export interface ChunkOwner {
  categoryId: number
  sourceId: string
  generation: number
  kind: CategoryKind
  groupOrder: number
}

// Map em ordem de uso: o primeiro é o menos usado (LRU).
const chunkCache = new Map<string, BlockItem[]>()
const identityCache = new Map<string, IdentityIndex>()
let cachedItems = 0

function cacheKey(database: CatalogDb, categoryId: number, revision: string | undefined, chunk: number): string {
  return `${database.name}:${categoryId}:${revision ?? ''}:${chunk}`
}

function cacheGet(key: string): BlockItem[] | undefined {
  const items = chunkCache.get(key)
  if (items) { chunkCache.delete(key); chunkCache.set(key, items) }
  return items
}

function cachePut(key: string, items: BlockItem[]): void {
  if (items.length > CHUNK_CACHE_MAX_ITEMS) return
  const previous = chunkCache.get(key)
  if (previous) { cachedItems -= previous.length; chunkCache.delete(key) }
  chunkCache.set(key, items)
  cachedItems += items.length
  for (const [oldest, value] of chunkCache) {
    if (cachedItems <= CHUNK_CACHE_MAX_ITEMS) break
    chunkCache.delete(oldest)
    cachedItems -= value.length
  }
}

/** Esquece os pedaços e o índice em cache de uma categoria (gravação nova ou liberação). */
export function forgetCachedChunks(database: CatalogDb, categoryId: number): void {
  const prefix = `${database.name}:${categoryId}:`
  for (const [key, value] of chunkCache) if (key.startsWith(prefix)) { chunkCache.delete(key); cachedItems -= value.length }
  for (const key of identityCache.keys()) if (key.startsWith(prefix)) identityCache.delete(key)
}

/** Itens decodificados em cache agora (teste do teto). */
export function cachedChunkItems(): number {
  return cachedItems
}

function asRecord(owner: ChunkOwner, item: BlockItem, position: number): CatalogRecord {
  return { ...item, sourceId: owner.sourceId, generation: owner.generation, kind: owner.kind, groupOrder: owner.groupOrder,
    categoryId: owner.categoryId, categoryPosition: position }
}

/** Chaves dos pedaços que cobrem `[start, end)` numa categoria de `count` itens. */
function chunkKeys(categoryId: number, count: number, start: number, end: number): Array<[number, number]> {
  const from = Math.max(0, start)
  const to = Math.min(count, end)
  if (to <= from) return []
  const first = Math.floor(from / BLOCK_CHUNK_ITEMS)
  const last = Math.floor((to - 1) / BLOCK_CHUNK_ITEMS)
  return Array.from({ length: last - first + 1 }, (_, index) => [categoryId, first + index] as [number, number])
}

/** Decodifica pedaços já lidos (fora de transação) e devolve os registros de `[start, end)`. */
async function decodeRange(
  database: CatalogDb,
  owner: ChunkOwner,
  rows: ReadonlyArray<CategoryChunkRecord | undefined>,
  start: number,
  end: number,
  shared?: BlockShared,
): Promise<CatalogRecord[]> {
  const result: CatalogRecord[] = []
  for (const row of rows) {
    if (!row) continue
    const key = cacheKey(database, owner.categoryId, row.revision, row.chunk)
    let items = cacheGet(key)
    if (!items) {
      items = await decodeBlockChunk(row, row.shared ?? shared ?? {})
      cachePut(key, items)
    }
    for (let index = 0; index < items.length; index += 1) {
      const position = row.start + index
      if (position >= start && position < end) result.push(asRecord(owner, items[index], position))
    }
  }
  return result
}

/**
 * Itens `[start, end)` de uma categoria, na ordem da fonte: lê o cabeçalho e só os pedaços que cobrem a faixa. Cabeçalho
 * sem `format` (formato antigo, ainda não convertido) → `items`, como antes.
 */
export async function readBlockChunks(database: CatalogDb, categoryId: number, start = 0, end = Number.MAX_SAFE_INTEGER): Promise<CatalogRecord[]> {
  const header = await database.categoryBlocks.get(categoryId)
  if (!header) return []
  return readHeaderChunks(database, header, start, end)
}

/** Como `readBlockChunks`, para quem já tem o cabeçalho em mãos. */
export async function readHeaderChunks(database: CatalogDb, header: CategoryBlockRecord, start = 0, end = Number.MAX_SAFE_INTEGER): Promise<CatalogRecord[]> {
  if (header.format !== 2) {
    return (header.items ?? []).slice(Math.max(0, start), end).map((item, index) => asRecord(header, item, Math.max(0, start) + index))
  }
  const keys = chunkKeys(header.categoryId, header.count ?? 0, start, end)
  if (keys.length === 0) return []
  const rows = await categoryChunks(database).bulkGet(keys)
  return decodeRange(database, header, rows, start, end, header.shared)
}

/**
 * Janela `[start, end)` sem ler o cabeçalho (contrato da 065: a janela nunca chama `categoryBlocks.get`): a categoria
 * diz a contagem e os pedaços trazem `revision`/`shared`.
 */
export async function readOwnerChunks(database: CatalogDb, owner: ChunkOwner, count: number, start: number, end: number): Promise<CatalogRecord[]> {
  const keys = chunkKeys(owner.categoryId, count, start, end)
  if (keys.length === 0) return []
  const rows = await categoryChunks(database).bulkGet(keys)
  return decodeRange(database, owner, rows, start, end)
}

/**
 * Os itens de um bloco, um pedaço por vez (busca por identidade/série: quem chama para ao achar e não decodifica o
 * resto). Formato antigo: um lote só, com `items`.
 */
export async function* iterateHeaderChunks(database: CatalogDb, header: CategoryBlockRecord): AsyncGenerator<CatalogRecord[]> {
  if (header.format !== 2) {
    yield await readHeaderChunks(database, header)
    return
  }
  for (let chunk = 0; chunk < (header.chunkCount ?? 0); chunk += 1) {
    const start = chunk * BLOCK_CHUNK_ITEMS
    yield await readHeaderChunks(database, header, start, start + BLOCK_CHUNK_ITEMS)
  }
}

/** Índice de identidade da gravação atual (cache pela `revision`). `undefined` = sem índice. */
export async function readIdentityIndex(database: CatalogDb, header: CategoryBlockRecord): Promise<IdentityIndex | undefined> {
  const key = cacheKey(database, header.categoryId, header.revision, IDENTITY_CHUNK)
  const cached = identityCache.get(key)
  if (cached) return cached
  const row = await categoryChunks(database).get([header.categoryId, IDENTITY_CHUNK])
  if (!row || row.revision !== header.revision) return undefined
  const index = await decodeIdentityIndex(row.bytes)
  identityCache.set(key, index)
  return index
}

/** Um item pelo id: posição pelo índice de identidade e um pedaço só (T010b). Sem índice, varre os pedaços. */
export async function findBlockItem(database: CatalogDb, header: CategoryBlockRecord, id: number): Promise<CatalogRecord | undefined> {
  if (header.format === 2) {
    const index = await readIdentityIndex(database, header)
    if (index) {
      const position = index.ids.indexOf(id)
      if (position < 0) return undefined
      return (await readHeaderChunks(database, header, position, position + 1))[0]
    }
  }
  return (await readHeaderChunks(database, header)).find((item) => item.id === id)
}

/** Erro de cota do IndexedDB (direto ou dentro do `AbortError` do Dexie). Local: este módulo não importa a fachada. */
function isQuota(error: unknown): boolean {
  const value = error as { name?: string; inner?: { name?: string } } | undefined
  return value?.name === 'QuotaExceededError' || value?.inner?.name === 'QuotaExceededError'
}

/**
 * Libera os itens de uma categoria (orçamento, liberação de espaço): cabeçalho, pedaços, linhas antigas, episódios
 * (série) e a projeção 065; a categoria fica como nunca obtida (D-007) e os ids voltam iguais ao obter de novo
 * (`blockItemId`).
 *
 * Duas transações de propósito: acima da cota, QUALQUER gravação falha (até um `update` pequeno) e só remoção passa —
 * medido no PC e o estado da TV de 2026-10-18. A 1ª só remove; a 2ª carimba a categoria e, se ainda não couber, a
 * categoria fica "órfã" (carimbada sem itens): a entrada a trata como não obtida e `repairOrphanCategories` conserta.
 */
export async function deleteCategoryItems(database: CatalogDb, categoryId: number): Promise<void> {
  forgetCachedChunks(database, categoryId)
  const category = await database.categories.get(categoryId)
  await database.transaction('rw', [database.categoryBlocks, database.channels, database.catalogReadManifests, database.catalogReadChunks, database.showcaseCandidates, categoryChunks(database)], async () => {
    await database.categoryBlocks.delete(categoryId)
    await categoryChunks(database).where('[categoryId+chunk]').between([categoryId, IDENTITY_CHUNK], [categoryId, Number.MAX_SAFE_INTEGER], true, true).delete()
    if (category) {
      const rows = database.channels.where('[sourceId+generation+kind+groupOrder]')
      await rows.equals([category.sourceId, category.generation, category.kind, category.order]).delete()
      if (category.kind === 'series') await rows.equals([category.sourceId, category.generation, 'episode', category.order]).delete()
    }
    await database.catalogReadManifests.delete(categoryId)
    await database.catalogReadChunks.where('categoryId').equals(categoryId).delete()
    // Feature 086 (FR-011): sem itens no aparelho, os candidatos das fileiras desta categoria também saem — uma fileira
    // nunca mostra card que não abre.
    await database.showcaseCandidates.delete(categoryId)
  })
  try {
    await markCategoryReleased(database, categoryId)
  } catch (error) {
    if (!isQuota(error)) throw error
  }
}

/** A categoria volta a "nunca obtida" (depois que os itens dela saíram). */
export function markCategoryReleased(database: CatalogDb, categoryId: number) {
  return database.categories.update(categoryId, { itemsFetchedAt: undefined, itemsCount: 0, itemsSignature: undefined,
    seriesEpisodesFetchedAt: undefined, storedBytes: undefined })
}

/**
 * A categoria diz que foi obtida, mas não tem itens no aparelho (liberada com o banco cheio, `deleteCategoryItems`)?
 * Só contagens por índice.
 */
export async function isOrphanCategory(database: CatalogDb, category: { id?: number; sourceId: string; generation: number; kind: string; order: number; itemsCount?: number; itemsFetchedAt?: number }): Promise<boolean> {
  if (category.itemsFetchedAt === undefined || !category.itemsCount || category.id === undefined) return false
  if ((await database.categoryBlocks.where(':id').equals(category.id).count()) > 0) return false
  const rows = await database.channels.where('[sourceId+generation+kind+groupOrder]')
    .equals([category.sourceId, category.generation, category.kind, category.order]).count()
  return rows === 0
}

import type { CatalogDb, CatalogRecord, CategoryBlockRecord } from './db'
import { categoryChunks, IDENTITY_CHUNK } from './chunkTables'
import { decodeBlockChunk, decodeIdentityIndex, encodeBlockChunks, encodeIdentityIndex, type BlockShared } from './blockCodec'
import type { BlockItem } from './db'

const chunkCache = new Map<string, { items: BlockItem[]; used: number }>()
let cachedItems = 0
const MAX_CACHED_ITEMS = 30_000

function cachePut(key: string, items: BlockItem[]): void {
  const previous = chunkCache.get(key)
  if (previous) cachedItems -= previous.items.length
  chunkCache.set(key, { items, used: Date.now() })
  cachedItems += items.length
  while (cachedItems > MAX_CACHED_ITEMS) {
    const oldest = [...chunkCache.entries()].sort((a, b) => a[1].used - b[1].used)[0]
    if (!oldest) break
    cachedItems -= oldest[1].items.length
    chunkCache.delete(oldest[0])
  }
}

function asRecord(block: CategoryBlockRecord, item: BlockItem, index: number): CatalogRecord {
  return { ...item, sourceId: block.sourceId, generation: block.generation, kind: block.kind, groupOrder: block.groupOrder, categoryId: block.categoryId, categoryPosition: index }
}

export async function readBlockChunks(database: CatalogDb, categoryId: number, start = 0, end = Number.MAX_SAFE_INTEGER): Promise<CatalogRecord[]> {
  const header = await database.categoryBlocks.get(categoryId)
  if (!header || header.format !== 2 || !header.chunkCount) return header?.items?.slice(start, end).map((item, index) => asRecord(header, item, start + index)) ?? []
  const first = Math.max(0, Math.floor(start / 500))
  const last = Math.min(header.chunkCount - 1, Math.max(first, Math.ceil(end / 500) - 1))
  const keys = Array.from({ length: last - first + 1 }, (_, i) => [categoryId, first + i] as [number, number])
  const rows = await categoryChunks(database).bulkGet(keys)
  const decoded: BlockItem[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (!row) continue
    const key = `${categoryId}:${header.revision}:${first + index}`
    const cached = chunkCache.get(key)
    if (cached) { cached.used = Date.now(); decoded.push(...cached.items) }
    else {
      const items = await decodeBlockChunk(row, header.shared ?? {})
      cachePut(key, items)
      decoded.push(...items)
    }
  }
  return decoded.slice(start - first * 500, end - first * 500).map((item, index) => asRecord(header, item, start + index))
}

const REVISION_CONFLICT = Symbol('revision-conflict')

export async function writeCompressedBlock(target: { categoryId: number; sourceId: string; generation: number; kind: CategoryBlockRecord['kind']; groupOrder: number }, records: CatalogRecord[], now: number, database: CatalogDb, attempt = 0): Promise<CategoryBlockRecord> {
  const expectedRevision = (await database.categoryBlocks.get(target.categoryId))?.revision
  const shared: BlockShared = { group: records.find((item) => item.group)?.group, providerCategoryId: records.find((item) => item.providerCategoryId)?.providerCategoryId }
  const items = records.map((record) => {
    const { id, sourceId, generation, kind, groupOrder, categoryId, categoryPosition, ...rest } = record
    void sourceId; void generation; void kind; void groupOrder; void categoryId; void categoryPosition
    return { ...rest, id: id ?? 0 } as BlockItem
  })
  const encoded = await encodeBlockChunks(items, shared)
  const identity = await encodeIdentityIndex(items)
  const revision = `${now}-${Math.random().toString(36).slice(2)}`
  const storedBytes = encoded.reduce((sum, chunk) => sum + chunk.bytes.byteLength, identity.byteLength)
  const header: CategoryBlockRecord = { ...target, format: 2, shared, count: items.length, chunkCount: encoded.length, storedBytes, revision }
  for (const key of [...chunkCache.keys()]) if (key.startsWith(`${target.categoryId}:`)) { cachedItems -= chunkCache.get(key)?.items.length ?? 0; chunkCache.delete(key) }
  try {
    await database.transaction('rw', database.categoryBlocks, database.categories, categoryChunks(database), async () => {
      const current = await database.categoryBlocks.get(target.categoryId)
      if (current?.revision !== expectedRevision) throw REVISION_CONFLICT
      const table = categoryChunks(database)
      await table.where('[categoryId+chunk]').between([target.categoryId, -1], [target.categoryId, Number.MAX_SAFE_INTEGER], true, true).delete()
      await table.bulkPut([{ categoryId: target.categoryId, sourceId: target.sourceId, generation: target.generation, chunk: IDENTITY_CHUNK, start: 0, count: items.length, bytes: identity }, ...encoded.map((chunk, index) => ({ ...chunk, chunk: index, categoryId: target.categoryId, sourceId: target.sourceId, generation: target.generation }))])
      await database.categoryBlocks.put(header)
      await database.categories.update(target.categoryId, { itemsFetchedAt: now, itemsCount: items.length, storedBytes })
    })
  } catch (error) {
    if (error === REVISION_CONFLICT && attempt < 2) return writeCompressedBlock(target, records, now, database, attempt + 1)
    throw error
  }
  return header
}

export async function deleteCategoryItems(database: CatalogDb, categoryId: number): Promise<void> {
  for (const key of [...chunkCache.keys()]) if (key.startsWith(`${categoryId}:`)) { cachedItems -= chunkCache.get(key)?.items.length ?? 0; chunkCache.delete(key) }
  const category = await database.categories.get(categoryId)
  await database.transaction('rw', [database.categoryBlocks, database.channels, database.categories, database.catalogReadManifests, database.catalogReadChunks, categoryChunks(database)], async () => {
    await database.categoryBlocks.delete(categoryId)
    await categoryChunks(database).where('[categoryId+chunk]').between([categoryId, -1], [categoryId, Number.MAX_SAFE_INTEGER], true, true).delete()
    if (category) await database.channels.where('[sourceId+generation+kind+groupOrder]').equals([category.sourceId, category.generation, category.kind, category.order]).delete()
    await database.catalogReadManifests.delete(categoryId)
    await database.catalogReadChunks.where('categoryId').equals(categoryId).delete()
    await database.categories.update(categoryId, { itemsFetchedAt: undefined, itemsCount: 0, itemsSignature: undefined, storedBytes: undefined })
  })
}

export async function readIdentityIndex(database: CatalogDb, categoryId: number) {
  const row = await categoryChunks(database).get([categoryId, IDENTITY_CHUNK])
  return row ? decodeIdentityIndex(row.bytes) : undefined
}

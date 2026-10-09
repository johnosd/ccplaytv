import { db, type CatalogDb, type CatalogRecord } from './db'
import type { CategoryBlockRecord } from './db'
import type { CatalogReadItem } from './db'
import { readItemToRecord, nextReadRevision, projectReadItem, READ_PROJECTION_CHUNK_SIZE, readProjectionManifest } from './readProjection'
import {
  getReadProjectionMemoChunk,
  setReadProjectionMemoChunk,
  type ReadProjectionMemoContext,
} from './readProjectionMemo'

export interface CategoryWindow {
  items: CatalogRecord[]
  total: number
  nextOffset?: number
}

function recordsFromBlock(block: CategoryBlockRecord): CatalogRecord[] {
  return block.items.map((item, index) => ({
    ...item,
    sourceId: block.sourceId,
    generation: block.generation,
    kind: block.kind,
    groupOrder: block.groupOrder,
    categoryId: block.categoryId,
    categoryPosition: index,
  }))
}

export async function prepareCategoryReadModel(sourceId: string, categoryId: number, database: CatalogDb = db): Promise<void> {
  const source = await database.sources.get(sourceId)
  const category = await database.categories.get(categoryId)
  if (!source || !category || category.sourceId !== sourceId || category.generation !== source.activeGeneration) return
  const existing = await readProjectionManifest(sourceId, categoryId, database)
  if (existing && category.itemsCount !== undefined && existing.count === category.itemsCount && existing.kind === category.kind) return
  const block = await database.categoryBlocks.get(categoryId)
  const records = block
    ? recordsFromBlock(block)
    : await database.channels
        .where('[sourceId+generation]')
        .equals([sourceId, category.generation])
        .filter((record) => record.kind === category.kind && (record.categoryId === categoryId || (record.categoryId === undefined && record.groupOrder === category.order)))
        .sortBy('categoryPosition')
  const revision = nextReadRevision()
  const items = records.map((record, index) =>
    projectReadItem(record, {
      sourceId,
      generation: category.generation,
      kind: category.kind,
      categoryId,
      groupOrder: category.order,
      categoryPosition: record.categoryPosition ?? index,
    }),
  )
  const chunks = Array.from({ length: Math.ceil(items.length / READ_PROJECTION_CHUNK_SIZE) }, (_, chunk) => items.slice(chunk * READ_PROJECTION_CHUNK_SIZE, (chunk + 1) * READ_PROJECTION_CHUNK_SIZE))
  await database.transaction(
    'rw',
    [database.sources, database.categories, database.channels, database.categoryBlocks, database.catalogReadManifests, database.catalogReadChunks] as any,
    async () => {
    // A leitura pode ter terminado depois de uma renovação. Só publica se a
    // mesma fonte/geração/categoria e assinatura ainda estiverem vigentes.
    const currentSource = await database.sources.get(sourceId)
    const currentCategory = await database.categories.get(categoryId)
    if (
      !currentSource ||
      !currentCategory ||
      currentSource.activeGeneration !== category.generation ||
      currentCategory.sourceId !== sourceId ||
      currentCategory.generation !== category.generation ||
      currentCategory.kind !== category.kind ||
      currentCategory.order !== category.order ||
      currentCategory.itemsSignature !== category.itemsSignature ||
      currentCategory.itemsCount !== category.itemsCount
    ) return

    const oldIds = await database.catalogReadChunks
      .where('[categoryId+revision]')
      .between([categoryId, ''], [categoryId, '\uffff'], true, true)
      .primaryKeys()
    if (oldIds.length > 0) await database.catalogReadChunks.bulkDelete(oldIds)
    await database.catalogReadChunks.bulkAdd(chunks.map((chunk, index) => ({
      id: [categoryId, revision, index] as [number, string, number],
      categoryId,
      sourceId,
      generation: category.generation,
      kind: category.kind,
      revision,
      chunk: index,
      items: chunk,
    })))
    await database.catalogReadManifests.put({
      categoryId,
      sourceId,
      generation: category.generation,
      kind: category.kind,
      revision,
      formatVersion: 1,
      count: items.length,
      chunkSize: READ_PROJECTION_CHUNK_SIZE,
      chunkCount: chunks.length,
      ready: true,
    })
  },
  )
}

export async function readCategoryWindow(sourceId: string, categoryId: number, offset: number, limit: number, database: CatalogDb = db): Promise<CategoryWindow> {
  const manifest = await readProjectionManifest(sourceId, categoryId, database)
  if (!manifest || limit <= 0 || offset >= manifest.count) return { items: [], total: manifest?.count ?? 0 }
  const safeOffset = Math.max(0, offset)
  const safeLimit = Math.max(1, Math.floor(limit))
  const firstChunk = Math.floor(safeOffset / manifest.chunkSize)
  const lastChunk = Math.floor((safeOffset + safeLimit - 1) / manifest.chunkSize)
  const context: ReadProjectionMemoContext = {
    sourceId,
    generation: manifest.generation,
    categoryId,
    revision: manifest.revision,
  }
  const chunksByNumber = new Map<number, CatalogReadItem[]>()
  const missing: number[] = []
  for (let chunk = firstChunk; chunk <= lastChunk; chunk += 1) {
    const cached = getReadProjectionMemoChunk(database, context, chunk)
    if (cached) chunksByNumber.set(chunk, cached)
    else missing.push(chunk)
  }
  if (missing.length > 0) {
    const persisted = await database.catalogReadChunks
      .where('[categoryId+revision+chunk]')
      .between([categoryId, manifest.revision, missing[0]], [categoryId, manifest.revision, missing[missing.length - 1]], true, true)
      .toArray()
    for (const chunk of persisted) {
      setReadProjectionMemoChunk(database, context, chunk.chunk, chunk.items)
      const cached = getReadProjectionMemoChunk(database, context, chunk.chunk)
      if (cached) chunksByNumber.set(chunk.chunk, cached)
    }
  }
  const items = Array.from({ length: lastChunk - firstChunk + 1 }, (_, index) => chunksByNumber.get(firstChunk + index) ?? [])
    .flat()
    .slice(safeOffset - firstChunk * manifest.chunkSize, safeOffset - firstChunk * manifest.chunkSize + safeLimit)
    .map(readItemToRecord)
  const nextOffset = safeOffset + items.length < manifest.count ? safeOffset + items.length : undefined
  return { items, total: manifest.count, nextOffset }
}




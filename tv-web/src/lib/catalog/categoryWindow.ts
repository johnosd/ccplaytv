import { db, type CatalogDb, type CatalogRecord } from './db'
import type { CategoryBlockRecord } from './db'
import type { CatalogReadItem } from './db'
import { getCategoryAccess } from './categoryAccess'
import { readItemToRecord, nextReadRevision, projectReadItem, READ_PROJECTION_CHUNK_SIZE, readProjectionManifest } from './readProjection'
import {
  getReadProjectionMemoChunk,
  setReadProjectionMemoChunk,
  type ReadProjectionMemoContext,
} from './readProjectionMemo'
import { readBlockChunks } from './blockChunks'

/**
 * Categorias a partir deste tamanho são lidas por janela na grade (feature 065, SC-007). Abaixo dele a leitura do bloco
 * inteiro custa menos que a projeção em disco, então nem a projeção é preparada em segundo plano.
 */
export const READ_WINDOW_MIN_ITEMS = 1000

export interface CategoryWindow {
  items: CatalogRecord[]
  total: number
  nextOffset?: number
}

function recordsFromBlock(block: CategoryBlockRecord): CatalogRecord[] {
  return (block.items ?? []).map((item, index) => ({
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
    ? block.format === 2 ? await readBlockChunks(database, categoryId) : recordsFromBlock(block)
    : await database.channels
        .where('[sourceId+generation]')
        .equals([sourceId, category.generation])
        .filter((record) => record.kind === category.kind && (record.categoryId === categoryId || (record.categoryId === undefined && record.groupOrder === category.order)))
        .sortBy('categoryPosition')
  // Só categoria grande ganha projeção: nas pequenas a grade lê o bloco inteiro, e a cópia compacta só ocuparia disco (na
  // TV, junto com o catálogo, chegou a dobrar o espaço usado). Uma projeção antiga de categoria que encolheu sai daqui.
  if (records.length < READ_WINDOW_MIN_ITEMS) {
    await dropReadModel(categoryId, database)
    return
  }
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
  // Feature 066 (FR-014/FR-020): a janela de uma categoria escondida/bloqueada é vazia, mesmo pedida por cache velho.
  if ((await getCategoryAccess(sourceId, database)).excluded.has(categoryId)) return { items: [], total: 0 }
  const manifest = await readProjectionManifest(sourceId, categoryId, database)
  if (!manifest) {
    const block = await database.categoryBlocks.get(categoryId)
    if (block?.format === 2) {
      const total = block.count ?? 0
      const items = await readBlockChunks(database, categoryId, offset, offset + limit)
      return { items, total, ...(offset + items.length < total ? { nextOffset: offset + items.length } : {}) }
    }
    return { items: [], total: 0 }
  }
  if (limit <= 0 || offset >= manifest.count) return { items: [], total: manifest.count }
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

/**
 * Catálogos gravados antes das projeções não têm janela pronta: prepara a que falta de UMA categoria grande de filmes/séries
 * por chamada (a maior primeiro), em segundo plano, para a grade nunca ler o bloco inteiro na entrada. Só consulta chaves
 * até escolher a categoria.
 *
 * @returns `true` se ainda sobrou categoria a preparar.
 */
export async function prepareMissingReadModels(sourceId: string, database: CatalogDb = db): Promise<boolean> {
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined) return false
  // Projeções de categorias pequenas gravadas por versões anteriores: liberam o espaço (uma leva por chamada).
  const small = (await database.catalogReadManifests.toArray()).filter((manifest) => manifest.count < READ_WINDOW_MIN_ITEMS)
  if (small.length > 0) {
    for (const manifest of small) await dropReadModel(manifest.categoryId, database)
    return true
  }
  const large = (await database.categories.where('sourceId').equals(sourceId).toArray())
    .filter((category) => category.generation === generation && category.kind !== 'channel' && (category.itemsCount ?? 0) >= READ_WINDOW_MIN_ITEMS)
    .sort((a, b) => (b.itemsCount ?? 0) - (a.itemsCount ?? 0))
  if (large.length === 0) return false
  const manifests = await database.catalogReadManifests.bulkGet(large.map((category) => category.id as number))
  const missing: number[] = []
  for (let index = 0; index < large.length; index += 1) {
    const categoryId = large[index].id as number
    if (manifests[index]?.generation === generation) continue
    if ((await database.categoryBlocks.where(':id').equals(categoryId).count()) > 0) missing.push(categoryId)
  }
  if (missing.length === 0) return false
  await prepareCategoryReadModel(sourceId, missing[0], database).catch(() => undefined)
  return missing.length > 1
}

/** Apaga a projeção de uma categoria (manifesto e pedaços); o canônico não é tocado. */
async function dropReadModel(categoryId: number, database: CatalogDb): Promise<void> {
  await database.transaction('rw', database.catalogReadManifests, database.catalogReadChunks, async () => {
    const ids = await database.catalogReadChunks.where('[categoryId+revision]').between([categoryId, ''], [categoryId, '\uffff'], true, true).primaryKeys()
    if (ids.length > 0) await database.catalogReadChunks.bulkDelete(ids)
    await database.catalogReadManifests.delete(categoryId)
  })
}

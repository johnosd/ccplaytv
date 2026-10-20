import { db, type CatalogDb, type CatalogRecord, type CategoryRecord } from './db'
import type { CatalogReadItem } from './db'
import { getCategoryAccess } from './categoryAccess'
import { readItemToRecord, readProjectionManifest } from './readProjection'
import {
  getReadProjectionMemoChunk,
  setReadProjectionMemoChunk,
  type ReadProjectionMemoContext,
} from './readProjectionMemo'
import { readBlockChunks, readOwnerChunks } from './blockChunks'

/**
 * Categorias a partir deste tamanho são lidas por janela na grade (feature 065, SC-007). Desde a feature 082 a janela
 * vem dos pedaços comprimidos (`blockChunks.ts`); a projeção 065 só é lida em categoria ainda não convertida.
 */
export const READ_WINDOW_MIN_ITEMS = 1000

export interface CategoryWindow {
  items: CatalogRecord[]
  total: number
  nextOffset?: number
}

/**
 * Feature 082 (D-004): a projeção 065 era uma 2ª cópia do catálogo (18,7 MB dos ~44 MB da lista real na TV) e não é
 * mais preparada — os pedaços já dão a leitura em janela. Esta função só apaga a projeção de uma categoria convertida
 * ou pequena; a de uma categoria ainda no formato antigo fica até a conversão (`blockConversion.ts`).
 */
export async function prepareCategoryReadModel(sourceId: string, categoryId: number, database: CatalogDb = db): Promise<void> {
  const category = await database.categories.get(categoryId)
  if (!category || category.sourceId !== sourceId) return
  if (category.storedBytes !== undefined || (category.itemsCount ?? 0) < READ_WINDOW_MIN_ITEMS) await dropReadModel(categoryId, database)
}

export async function readCategoryWindow(sourceId: string, categoryId: number, offset: number, limit: number, database: CatalogDb = db): Promise<CategoryWindow> {
  // Feature 066 (FR-014/FR-020): a janela de uma categoria escondida/bloqueada é vazia, mesmo pedida por cache velho.
  if ((await getCategoryAccess(sourceId, database)).excluded.has(categoryId)) return { items: [], total: 0 }
  const safeOffset = Math.max(0, offset)
  const safeLimit = Math.max(0, Math.floor(limit))
  const [source, category] = await Promise.all([database.sources.get(sourceId), database.categories.get(categoryId)])
  if (!source || !category || category.sourceId !== sourceId || category.generation !== source.activeGeneration) return { items: [], total: 0 }
  // Formato 2 (feature 082): só os pedaços que cobrem a janela, sem ler o cabeçalho (contrato da 065).
  if (category.storedBytes !== undefined) {
    const total = category.itemsCount ?? 0
    const owner = { categoryId, sourceId, generation: category.generation, kind: category.kind, groupOrder: category.order }
    const items = safeLimit > 0 ? await readOwnerChunks(database, owner, total, safeOffset, safeOffset + safeLimit) : []
    const next = safeOffset + items.length
    return { items, total, ...(items.length > 0 && next < total ? { nextOffset: next } : {}) }
  }
  const manifest = await readProjectionManifest(sourceId, categoryId, database)
  if (!manifest) {
    // Bloco antigo (ou linhas da 039) ainda não convertido, sem projeção: lê como está; a conversão em segundo plano
    // resolve.
    let all = await readBlockChunks(database, categoryId)
    if (all.length === 0) {
      all = await database.channels.where('[sourceId+generation+kind+groupOrder]')
        .equals([sourceId, category.generation, category.kind, category.order]).sortBy('categoryPosition')
    }
    const items = all.slice(safeOffset, safeOffset + safeLimit)
    const next = safeOffset + items.length
    return { items, total: all.length, ...(items.length > 0 && next < all.length ? { nextOffset: next } : {}) }
  }
  if (safeLimit <= 0 || safeOffset >= manifest.count) return { items: [], total: manifest.count }
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
 * A categoria pode ser lida por janela? Formato 2 (pedaços, feature 082) ou projeção 065 atual. `revision` reinicia um
 * cursor quando a categoria muda. `undefined` = lê a categoria inteira.
 */
export async function categoryWindowInfo(sourceId: string, category: CategoryRecord, database: CatalogDb = db): Promise<{ count: number; revision: string } | undefined> {
  if (category.storedBytes !== undefined) return { count: category.itemsCount ?? 0, revision: `items:${category.itemsSignature ?? ''}` }
  const manifest = await readProjectionManifest(sourceId, category.id as number, database)
  return manifest ? { count: manifest.count, revision: manifest.revision } : undefined
}

/**
 * Feature 082: as projeções 065 não são mais preparadas; esta limpeza em segundo plano apaga as que sobraram de versões
 * anteriores, uma leva por chamada.
 *
 * @returns `true` se apagou algo (pode haver mais).
 */
export async function prepareMissingReadModels(_sourceId?: string, database: CatalogDb = db): Promise<boolean> {
  const manifests = await database.catalogReadManifests.toArray()
  if (manifests.length === 0) return false
  // Todas saem: a de categoria ainda não convertida também (a janela lê o bloco antigo até a conversão). Vêm ANTES da
  // conversão no `housekeeping`: com o banco cheio, apagar é o que abre espaço para converter (~18 MB na TV).
  const obsolete = manifests.slice(0, 20)
  for (const manifest of obsolete) await dropReadModel(manifest.categoryId, database)
  return obsolete.length > 0
}

/** Apaga a projeção de uma categoria (manifesto e pedaços); o canônico não é tocado. */
async function dropReadModel(categoryId: number, database: CatalogDb): Promise<void> {
  await database.transaction('rw', database.catalogReadManifests, database.catalogReadChunks, async () => {
    const ids = await database.catalogReadChunks.where('[categoryId+revision]').between([categoryId, ''], [categoryId, '￿'], true, true).primaryKeys()
    if (ids.length > 0) await database.catalogReadChunks.bulkDelete(ids)
    await database.catalogReadManifests.delete(categoryId)
  })
}

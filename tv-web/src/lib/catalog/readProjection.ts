import { db, type BlockItem, type CatalogDb, type CatalogReadItem, type CatalogReadManifest, type CatalogRecord } from './db'
import { invalidateReadProjectionMemo } from './readProjectionMemo'

export const READ_PROJECTION_FORMAT = 1
export const READ_PROJECTION_CHUNK_SIZE = 240
const READ_REVISION_MIN = ''
const READ_REVISION_MAX = '\uffff'

let revisionSequence = 0

export function nextReadRevision(now = Date.now()): string {
  revisionSequence += 1
  return `${now.toString(36)}-${revisionSequence.toString(36)}`
}

export function projectReadItem(
  record: CatalogRecord | BlockItem,
  context: { sourceId: string; generation: number; kind: CatalogReadItem['kind']; categoryId: number; groupOrder: number; categoryPosition: number },
): CatalogReadItem {
  return {
    id: record.id as number,
    ...context,
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
    hasPlayback: Boolean(record.directUrl) || Boolean(record.providerStreamId),
  }
}

export function readItemToRecord(item: CatalogReadItem): CatalogRecord {
  return {
    id: item.id,
    sourceId: item.sourceId,
    generation: item.generation,
    kind: item.kind,
    categoryId: item.categoryId,
    categoryPosition: item.categoryPosition,
    groupOrder: item.groupOrder,
    name: item.name,
    originalName: item.originalName,
    group: item.group,
    providerStreamId: item.providerStreamId,
    seriesId: item.seriesId,
    iconUrl: item.iconUrl,
    year: item.year,
    addedAt: item.addedAt,
    providerRating: item.providerRating,
    providerGenres: item.providerGenres,
    providerBackdropUrl: item.providerBackdropUrl,
    epgChannelId: item.epgChannelId,
    archiveDays: item.archiveDays,
    hasPlayback: item.hasPlayback,
  }
}

export async function readProjectionManifest(
  sourceId: string,
  categoryId: number,
  database: CatalogDb = db,
): Promise<CatalogReadManifest | undefined> {
  const source = await database.sources.get(sourceId)
  const manifest = await database.catalogReadManifests.get(categoryId)
  if (!source || !manifest || !manifest.ready || manifest.sourceId !== sourceId || manifest.generation !== source.activeGeneration) return undefined
  return manifest
}

/**
 * Remove a projeção de uma categoria. O chamador deve incluir as duas tabelas
 * numa transação quando a invalidação acompanha uma escrita canônica.
 */
export async function invalidateCategoryReadModel(
  categoryId: number,
  database: CatalogDb = db,
): Promise<void> {
  invalidateReadProjectionMemo(database)
  const chunkKeys = await database.catalogReadChunks
    .where('[categoryId+revision]')
    .between([categoryId, READ_REVISION_MIN], [categoryId, READ_REVISION_MAX], true, true)
    .primaryKeys()
  if (chunkKeys.length > 0) await database.catalogReadChunks.bulkDelete(chunkKeys)
  await database.catalogReadManifests.delete(categoryId)
}

/** Remove todas as projeções de uma geração, inclusive categorias já removidas. */
export async function invalidateGenerationReadModels(
  sourceId: string,
  generation: number,
  database: CatalogDb = db,
): Promise<void> {
  invalidateReadProjectionMemo(database)
  const manifestKeys = await database.catalogReadManifests
    .where('[sourceId+generation+kind]')
    .between([sourceId, generation, ''], [sourceId, generation, '\uffff'], true, true)
    .primaryKeys()
  const chunkKeys = await database.catalogReadChunks
    .where('[sourceId+generation]')
    .equals([sourceId, generation])
    .primaryKeys()
  if (chunkKeys.length > 0) await database.catalogReadChunks.bulkDelete(chunkKeys)
  if (manifestKeys.length > 0) await database.catalogReadManifests.bulkDelete(manifestKeys)
}

/** Remove todas as projeções de uma fonte, usada na remoção definitiva. */
export async function invalidateSourceReadModels(
  sourceId: string,
  database: CatalogDb = db,
): Promise<void> {
  invalidateReadProjectionMemo(database)
  const manifestKeys = await database.catalogReadManifests.where('sourceId').equals(sourceId).primaryKeys()
  const chunkKeys = await database.catalogReadChunks
    .where('[sourceId+generation]')
    .between([sourceId, Number.MIN_SAFE_INTEGER], [sourceId, Number.MAX_SAFE_INTEGER], true, true)
    .primaryKeys()
  if (chunkKeys.length > 0) await database.catalogReadChunks.bulkDelete(chunkKeys)
  if (manifestKeys.length > 0) await database.catalogReadManifests.bulkDelete(manifestKeys)
}

/** Remove projeções de todas as gerações exceto a recém-publicada. */
export async function invalidateReadModelsOutsideGeneration(
  sourceId: string,
  generation: number,
  database: CatalogDb = db,
): Promise<void> {
  invalidateReadProjectionMemo(database)
  const manifests = await database.catalogReadManifests.where('sourceId').equals(sourceId).toArray()
  const stale = manifests.filter((manifest) => manifest.generation !== generation)
  for (const manifest of stale) await invalidateCategoryReadModel(manifest.categoryId, database)
}


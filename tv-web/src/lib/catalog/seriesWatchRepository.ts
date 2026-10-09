/**
 * PersistÃªncia incremental do selo de sÃ©ries assistidas (feature 065 / US4).
 *
 * Este mÃ³dulo nÃ£o descobre episÃ³dios nem consulta rede. Quem conhece os
 * episÃ³dios monta os stable ids e substitui os membros da sÃ©rie; estados
 * alterados invalidam somente os resumos localizados pelo Ã­ndice multiEntry.
 */
import { db, type CatalogDb, type SeriesWatchMemberRecord, type SeriesWatchSummaryRecord } from './db'
import type { SeriesWatchedSummary } from './seriesWatchedSummary'

export const SERIES_WATCH_ALGORITHM_VERSION = 1

export interface SeriesWatchTarget {
  sourceId: string
  generation: number
  seriesId: string
}

export interface SeriesWatchSummaryOptions {
  membersRevision: number
  stateRevision: number
  algorithmVersion?: number
}

function keyOf(target: SeriesWatchTarget): [string, number, string] {
  return [target.sourceId, target.generation, target.seriesId]
}

/** LÃª os membros sem copiar payload de episÃ³dio. */
export async function getSeriesWatchMembers(
  target: SeriesWatchTarget,
  database: CatalogDb = db,
): Promise<SeriesWatchMemberRecord | undefined> {
  return database.seriesWatchMembers.get(keyOf(target))
}

/** Lista os membros de uma geraÃ§Ã£o, preservando a ordem da fonte. */
export async function listSeriesWatchMembers(
  sourceId: string,
  generation: number,
  database: CatalogDb = db,
): Promise<SeriesWatchMemberRecord[]> {
  return database.seriesWatchMembers
    .where('[sourceId+generation]')
    .equals([sourceId, generation])
    .toArray()
}

/**
 * Substitui os membros e invalida o resumo na mesma transaÃ§Ã£o. A cÃ³pia do
 * vetor mantÃ©m a multiplicidade de stable ids sem reter objetos de episÃ³dio.
 */
export async function storeSeriesWatchMembers(
  target: SeriesWatchTarget,
  stableIds: readonly string[],
  database: CatalogDb = db,
): Promise<SeriesWatchMemberRecord> {
  return database.transaction('rw', database.seriesWatchMembers, database.seriesWatchSummaries, async () => {
    const key = keyOf(target)
    const previous = await database.seriesWatchMembers.get(key)
    const record: SeriesWatchMemberRecord = {
      id: key,
      ...target,
      revision: (previous?.revision ?? 0) + 1,
      stableIds: [...stableIds],
    }
    await database.seriesWatchMembers.put(record)
    await database.seriesWatchSummaries.delete(key)
    return record
  })
}

/** Compatibilidade explÃ­cita para chamadores que usam a semÃ¢ntica "replace". */
export const replaceSeriesWatchMembers = storeSeriesWatchMembers

/** LÃª um resumo cru, sem tratÃ¡-lo como vÃ¡lido. */
export async function getSeriesWatchSummary(
  target: SeriesWatchTarget,
  database: CatalogDb = db,
): Promise<SeriesWatchSummaryRecord | undefined> {
  return database.seriesWatchSummaries.get(keyOf(target))
}

/**
 * LÃª somente um resumo que ainda aponta para a revisÃ£o corrente de membros e
 * para o algoritmo vigente. `stateRevision` permite invalidar estados sem
 * revarrer todas as sÃ©ries.
 */
export async function readValidSeriesWatchSummary(
  target: SeriesWatchTarget,
  stateRevision: number,
  database: CatalogDb = db,
): Promise<SeriesWatchedSummary | undefined> {
  const [members, summary] = await Promise.all([
    getSeriesWatchMembers(target, database),
    getSeriesWatchSummary(target, database),
  ])
  if (!members || !summary) return undefined
  if (summary.algorithmVersion !== SERIES_WATCH_ALGORITHM_VERSION) return undefined
  if (summary.membersRevision !== members.revision || summary.stateRevision !== stateRevision) return undefined
  return summary.summary
}

/** Grava um resumo somente quando a revisÃ£o de membros ainda Ã© a informada. */
export async function storeSeriesWatchSummary(
  target: SeriesWatchTarget,
  summary: SeriesWatchedSummary,
  options: SeriesWatchSummaryOptions,
  database: CatalogDb = db,
): Promise<boolean> {
  return database.transaction('rw', database.seriesWatchMembers, database.seriesWatchSummaries, async () => {
    const members = await database.seriesWatchMembers.get(keyOf(target))
    if (!members || members.revision !== options.membersRevision) return false
    const record: SeriesWatchSummaryRecord = {
      id: keyOf(target),
      ...target,
      algorithmVersion: options.algorithmVersion ?? SERIES_WATCH_ALGORITHM_VERSION,
      membersRevision: options.membersRevision,
      stateRevision: options.stateRevision,
      summary,
    }
    await database.seriesWatchSummaries.put(record)
    return true
  })
}

/** Remove o resumo desta sÃ©rie; os membros continuam vÃ¡lidos para o prÃ³ximo cÃ¡lculo. */
export async function invalidateSeriesWatchSummary(
  target: SeriesWatchTarget,
  database: CatalogDb = db,
): Promise<void> {
  await database.seriesWatchSummaries.delete(keyOf(target))
}

/**
 * Localiza sÃ©ries que contÃªm um stable id e invalida sÃ³ seus resumos. O Ã­ndice
 * multiEntry evita varredura global de episÃ³dios e preserva fontes/geraÃ§Ãµes.
 */
export async function invalidateSeriesWatchByStableId(
  stableId: string,
  database: CatalogDb = db,
): Promise<SeriesWatchTarget[]> {
  const members = await database.seriesWatchMembers.where('stableIds').equals(stableId).toArray()
  if (members.length === 0) return []
  const targets = members.map(({ sourceId, generation, seriesId }) => ({ sourceId, generation, seriesId }))
  await database.seriesWatchSummaries.bulkDelete(targets.map(keyOf))
  return targets
}

/** Alias descritivo usado pelos writers de estado do usuÃ¡rio. */
export const invalidateSeriesWatchForStableId = invalidateSeriesWatchByStableId

export async function deleteSeriesWatchForGeneration(sourceId: string, generation: number, database: CatalogDb = db): Promise<void> {
  await database.seriesWatchMembers.where('[sourceId+generation]').equals([sourceId, generation]).delete()
  await database.seriesWatchSummaries.where('[sourceId+generation]').equals([sourceId, generation]).delete()
}

export async function deleteSeriesWatchForSource(sourceId: string, database: CatalogDb = db): Promise<void> {
  await database.seriesWatchMembers.where('sourceId').equals(sourceId).delete()
  await database.seriesWatchSummaries.where('sourceId').equals(sourceId).delete()
}


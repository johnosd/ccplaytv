/**
 * Persistência incremental do selo de séries assistidas (feature 065 / US4).
 *
 * Este módulo não descobre episódios nem consulta rede. Quem conhece os
 * episódios monta os stable ids e substitui os membros da série; estados
 * alterados invalidam somente os resumos localizados pelo índice multiEntry.
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

/** Lê os membros sem copiar payload de episódio. */
export async function getSeriesWatchMembers(
  target: SeriesWatchTarget,
  database: CatalogDb = db,
): Promise<SeriesWatchMemberRecord | undefined> {
  return database.seriesWatchMembers.get(keyOf(target))
}

/** Lista os membros de uma geração, preservando a ordem da fonte. */
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
 * Substitui os membros e invalida o resumo na mesma transação. A cópia do
 * vetor mantém a multiplicidade de stable ids sem reter objetos de episódio.
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

/** Compatibilidade explícita para chamadores que usam a semântica "replace". */
export const replaceSeriesWatchMembers = storeSeriesWatchMembers

/** Lê um resumo cru, sem tratá-lo como válido. */
export async function getSeriesWatchSummary(
  target: SeriesWatchTarget,
  database: CatalogDb = db,
): Promise<SeriesWatchSummaryRecord | undefined> {
  return database.seriesWatchSummaries.get(keyOf(target))
}

/**
 * Lê somente um resumo que ainda aponta para a revisão corrente de membros e
 * para o algoritmo vigente. `stateRevision` permite invalidar estados sem
 * revarrer todas as séries.
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

/** Grava um resumo somente quando a revisão de membros ainda é a informada. */
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

/** Remove o resumo desta série; os membros continuam válidos para o próximo cálculo. */
export async function invalidateSeriesWatchSummary(
  target: SeriesWatchTarget,
  database: CatalogDb = db,
): Promise<void> {
  await database.seriesWatchSummaries.delete(keyOf(target))
}

/**
 * Localiza séries que contêm um stable id e invalida só seus resumos. O índice
 * multiEntry evita varredura global de episódios e preserva fontes/gerações.
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

/** Alias descritivo usado pelos writers de estado do usuário. */
export const invalidateSeriesWatchForStableId = invalidateSeriesWatchByStableId

export async function deleteSeriesWatchForGeneration(sourceId: string, generation: number, database: CatalogDb = db): Promise<void> {
  await database.seriesWatchMembers.where('[sourceId+generation]').equals([sourceId, generation]).delete()
  await database.seriesWatchSummaries.where('[sourceId+generation]').equals([sourceId, generation]).delete()
}

export async function deleteSeriesWatchForSource(sourceId: string, database: CatalogDb = db): Promise<void> {
  await database.seriesWatchMembers.where('sourceId').equals(sourceId).delete()
  await database.seriesWatchSummaries.where('sourceId').equals(sourceId).delete()
}


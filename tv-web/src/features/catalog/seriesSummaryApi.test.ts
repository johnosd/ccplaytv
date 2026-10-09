import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../../lib/catalog/db'
import { buildStableId } from '../../lib/catalog/userStateRepository'
import { storeSeriesWatchMembers, storeSeriesWatchSummary } from '../../lib/catalog/seriesWatchRepository'
import { loadSeriesWatchedSummaries } from './seriesSummaryApi'

let database: CatalogDb
const sourceId = 'summary-api-source'
const target = { sourceId, generation: 1, seriesId: 'series-1' }

beforeEach(async () => {
  database = new CatalogDb(`test-series-summary-api-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: sourceId, type: 'm3u_url', displayName: 'Lista', connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})

afterEach(async () => {
  await database.delete()
})

describe('seriesSummaryApi', () => {
  it('recalcula só membros inválidos e preserva multiplicidade sem consultar episódios na reentrada', async () => {
    const ids = [
      buildStableId({ sourceId, kind: 'episode', providerStreamId: 'e1', seriesId: target.seriesId, seasonNumber: 1, episodeNumber: 1 }),
      buildStableId({ sourceId, kind: 'episode', providerStreamId: 'e1', seriesId: target.seriesId, seasonNumber: 1, episodeNumber: 1 }),
    ]
    const members = await storeSeriesWatchMembers(target, ids, database)
    await database.userStates.put({ stableId: ids[0], sourceId, isFavorite: false, completedAt: 1, createdAt: 1, updatedAt: 1 })
    await storeSeriesWatchSummary(target, { known: 2, watched: 2, upToDate: true }, { membersRevision: members.revision, stateRevision: 1 }, database)
    const first = await loadSeriesWatchedSummaries(sourceId, database)
    const second = await loadSeriesWatchedSummaries(sourceId, database)
    expect(first.get(target.seriesId)).toEqual({ known: 2, watched: 2, upToDate: true })
    expect(second).toEqual(first)
  })

  it('mantém o selo em memória quando quota impede persistir o resumo derivado', async () => {
    const id = buildStableId({ sourceId, kind: 'episode', providerStreamId: 'e1', seriesId: target.seriesId, seasonNumber: 1, episodeNumber: 1 })
    await storeSeriesWatchMembers(target, [id], database)
    await database.userStates.put({ stableId: id, sourceId, isFavorite: false, completedAt: 1, createdAt: 1, updatedAt: 1 })
    vi.spyOn(database.seriesWatchSummaries, 'put').mockRejectedValue(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))
    await expect(loadSeriesWatchedSummaries(sourceId, database)).resolves.toEqual(new Map([[target.seriesId, { known: 1, watched: 1, upToDate: true }]]))
  })
})

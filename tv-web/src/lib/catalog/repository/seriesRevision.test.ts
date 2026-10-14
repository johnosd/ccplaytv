import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb } from '../db'
import { storeSeriesEpisodes } from './series'
import { readValidSeriesWatchSummary, storeSeriesWatchSummary, getSeriesWatchMembers } from './seriesWatchRepository'
import { buildStableId, updateProgress } from '../userStateRepository'

let database: CatalogDb
const SOURCE_ID = 'series-revision-source'
const TARGET = { sourceId: SOURCE_ID, generation: 1, seriesId: 'series-1' }

beforeEach(async () => {
  database = new CatalogDb(`test-series-revision-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE_ID, type: 'm3u_url', displayName: 'Lista', connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})

afterEach(async () => {
  await database.delete()
})

describe('series revision integration', () => {
  it('reconstrói membros a partir dos episódios publicados e invalida só a série afetada ao mudar estado', async () => {
    const seriesRecord = (await database.channels.add({ sourceId: SOURCE_ID, generation: 1, kind: 'series', name: 'Série', originalName: 'Série', groupOrder: 0, seriesId: TARGET.seriesId })) as number
    const episodes = [1, 2].map((episodeNumber) => ({
      sourceId: SOURCE_ID, generation: 1, kind: 'episode' as const, name: `E${episodeNumber}`, originalName: `E${episodeNumber}`,
      groupOrder: 0, seriesId: TARGET.seriesId, providerStreamId: `ep-${episodeNumber}`, seasonNumber: 1, episodeNumber,
    }))
    await storeSeriesEpisodes({ ...TARGET, seriesRecordId: seriesRecord }, episodes, 10, database)
    const members = await getSeriesWatchMembers(TARGET, database)
    expect(members?.stableIds).toEqual(episodes.map((episode) => buildStableId({ ...episode, kind: 'episode' })))
    await storeSeriesWatchSummary(TARGET, { known: 2, watched: 0, upToDate: false }, { membersRevision: members!.revision, stateRevision: 1 }, database)
    await updateProgress(members!.stableIds[0], SOURCE_ID, 30, database)
    expect(await readValidSeriesWatchSummary(TARGET, 1, database)).toBeUndefined()
  })

  it('limpa membros e resumos quando uma geração antiga ou a fonte é removida', async () => {
    await database.seriesWatchMembers.add({ id: [SOURCE_ID, 1, 'series-1'], ...TARGET, revision: 1, stableIds: ['episode-1'] })
    await database.seriesWatchSummaries.add({ id: [SOURCE_ID, 1, 'series-1'], ...TARGET, algorithmVersion: 1, membersRevision: 1, stateRevision: 1, summary: { known: 1, watched: 0, upToDate: false } })
    const { deleteSeriesWatchForGeneration, deleteSeriesWatchForSource } = await import('./seriesWatchRepository')
    await deleteSeriesWatchForGeneration(SOURCE_ID, 1, database)
    expect(await database.seriesWatchMembers.count()).toBe(0)
    expect(await database.seriesWatchSummaries.count()).toBe(0)
    await deleteSeriesWatchForSource(SOURCE_ID, database)
  })

  it('incrementa a revisão e descarta o selo quando a lista de episódios muda', async () => {
    const seriesRecord = (await database.channels.add({ sourceId: SOURCE_ID, generation: 1, kind: 'series', name: 'Série', originalName: 'Série', groupOrder: 0, seriesId: TARGET.seriesId })) as number
    const episode = (id: string) => ({ sourceId: SOURCE_ID, generation: 1, kind: 'episode' as const, name: id, originalName: id, groupOrder: 0, seriesId: TARGET.seriesId, providerStreamId: id, seasonNumber: 1, episodeNumber: 1 })
    await storeSeriesEpisodes({ ...TARGET, seriesRecordId: seriesRecord }, [episode('a')], 10, database)
    const first = await getSeriesWatchMembers(TARGET, database)
    await storeSeriesWatchSummary(TARGET, { known: 1, watched: 1, upToDate: true }, { membersRevision: first!.revision, stateRevision: 1 }, database)
    await storeSeriesEpisodes({ ...TARGET, seriesRecordId: seriesRecord }, [episode('b')], 20, database)
    const second = await getSeriesWatchMembers(TARGET, database)
    expect(second?.revision).toBe(2)
    expect(second?.stableIds).not.toEqual(first?.stableIds)
    expect(await readValidSeriesWatchSummary(TARGET, 1, database)).toBeUndefined()
  })
})

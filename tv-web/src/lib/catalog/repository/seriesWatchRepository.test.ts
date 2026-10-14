import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../db'
import { summarizeSeriesWatched } from '../seriesWatchedSummary'
import {
  getSeriesWatchMembers,
  getSeriesWatchSummary,
  invalidateSeriesWatchByStableId,
  readValidSeriesWatchSummary,
  storeSeriesWatchMembers,
  storeSeriesWatchSummary,
} from './seriesWatchRepository'

let database: CatalogDb
const target = { sourceId: 'series-source', generation: 1, seriesId: 'series-1' }

beforeEach(async () => {
  database = new CatalogDb(`test-series-watch-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: target.sourceId, type: 'm3u_url', displayName: 'Lista', connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})

afterEach(async () => {
  await database.delete()
})

describe('seriesWatchRepository', () => {
  it('reutiliza resumo quando membros e estados continuam na mesma revisão', async () => {
    const members = await storeSeriesWatchMembers(target, ['episode-a', 'episode-b'], database)
    const summary = summarizeSeriesWatched([{ completedAt: 1 }, {}])
    expect(await storeSeriesWatchSummary(target, summary, { membersRevision: members.revision, stateRevision: 4 }, database)).toBe(true)
    expect(await readValidSeriesWatchSummary(target, 4, database)).toEqual(summary)
    expect(await readValidSeriesWatchSummary(target, 5, database)).toBeUndefined()
  })

  it('invalida somente as séries que contêm o stable id', async () => {
    const other = { sourceId: target.sourceId, generation: 1, seriesId: 'series-2' }
    const first = await storeSeriesWatchMembers(target, ['episode-a'], database)
    const second = await storeSeriesWatchMembers(other, ['episode-b'], database)
    const summary = summarizeSeriesWatched([{ completedAt: 1 }])
    await storeSeriesWatchSummary(target, summary, { membersRevision: first.revision, stateRevision: 1 }, database)
    await storeSeriesWatchSummary(other, summary, { membersRevision: second.revision, stateRevision: 1 }, database)
    expect((await invalidateSeriesWatchByStableId('episode-a', database)).map((item) => item.seriesId)).toEqual(['series-1'])
    expect(await readValidSeriesWatchSummary(target, 1, database)).toBeUndefined()
    expect(await readValidSeriesWatchSummary(other, 1, database)).toEqual(summary)
  })

  it('preserva a multiplicidade dos ids e mantém equivalência com o helper puro', async () => {
    const members = await storeSeriesWatchMembers(target, ['episode-a', 'episode-a', 'episode-b'], database)
    await database.userStates.bulkPut([
      { stableId: 'episode-a', sourceId: target.sourceId, isFavorite: false, completedAt: 10, createdAt: 1, updatedAt: 10 },
      { stableId: 'episode-b', sourceId: target.sourceId, isFavorite: false, createdAt: 1, updatedAt: 1 },
    ])

    const states = await database.userStates.bulkGet(members.stableIds)
    const expected = summarizeSeriesWatched(states.map((state) => ({ completedAt: state?.completedAt })))
    expect(expected).toEqual({ known: 3, watched: 2, upToDate: false })
    expect(members.stableIds).toEqual(['episode-a', 'episode-a', 'episode-b'])
    expect(await invalidateSeriesWatchByStableId('episode-a', database)).toEqual([target])
  })

  it('isola a mesma série entre gerações e não invalida a geração inativa', async () => {
    const next = { ...target, generation: 2 }
    const first = await storeSeriesWatchMembers(target, ['episode-a'], database)
    const second = await storeSeriesWatchMembers(next, ['episode-a'], database)
    const summary = { known: 1, watched: 1, upToDate: true }
    await storeSeriesWatchSummary(target, summary, { membersRevision: first.revision, stateRevision: 4 }, database)
    await storeSeriesWatchSummary(next, summary, { membersRevision: second.revision, stateRevision: 4 }, database)

    expect(await invalidateSeriesWatchByStableId('episode-a', database)).toEqual([target, next])
    expect(await readValidSeriesWatchSummary(target, 4, database)).toBeUndefined()
    expect(await readValidSeriesWatchSummary(next, 4, database)).toBeUndefined()
  })

  it('não perde resumo anterior quando a escrita falha por quota', async () => {
    const members = await storeSeriesWatchMembers(target, ['episode-a'], database)
    const summary = { known: 1, watched: 1, upToDate: true }
    await storeSeriesWatchSummary(target, summary, { membersRevision: members.revision, stateRevision: 4 }, database)
    const put = vi.spyOn(database.seriesWatchSummaries, 'put').mockRejectedValue(
      Object.assign(new Error('full'), { name: 'QuotaExceededError' }),
    )

    await expect(storeSeriesWatchSummary(target, { known: 1, watched: 0, upToDate: false }, {
      membersRevision: members.revision,
      stateRevision: 5,
    }, database)).rejects.toMatchObject({ name: 'QuotaExceededError' })
    put.mockRestore()
    expect(await getSeriesWatchSummary(target, database)).toMatchObject({
      summary,
      membersRevision: members.revision,
      stateRevision: 4,
    })
    expect(await getSeriesWatchMembers(target, database)).toMatchObject({ stableIds: ['episode-a'] })
  })
})

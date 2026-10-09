import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import {
  getSeriesWatchMembers,
  invalidateSeriesWatchByStableId,
  readValidSeriesWatchSummary,
  storeSeriesWatchMembers,
  storeSeriesWatchSummary,
} from './seriesWatchRepository'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-series-watch-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

const target = { sourceId: 'source-1', generation: 3, seriesId: 'series-7' }

describe('seriesWatchRepository', () => {
  it('preserva multiplicidade, incrementa revisão e invalida o resumo ao substituir membros', async () => {
    const first = await storeSeriesWatchMembers(target, ['ep-1', 'ep-1', 'ep-2'], database)
    expect(first.revision).toBe(1)
    expect(first.stableIds).toEqual(['ep-1', 'ep-1', 'ep-2'])

    expect(await storeSeriesWatchSummary(target, { known: 3, watched: 2, upToDate: false }, {
      membersRevision: first.revision,
      stateRevision: 4,
    }, database)).toBe(true)
    expect(await readValidSeriesWatchSummary(target, 4, database)).toEqual({ known: 3, watched: 2, upToDate: false })

    const second = await storeSeriesWatchMembers(target, ['ep-3'], database)
    expect(second.revision).toBe(2)
    expect(await getSeriesWatchMembers(target, database)).toEqual(second)
    expect(await readValidSeriesWatchSummary(target, 4, database)).toBeUndefined()
  })

  it('localiza somente a geração pelo índice multiEntry e invalida o selo afetado', async () => {
    const other = { ...target, generation: 4 }
    const first = await storeSeriesWatchMembers(target, ['shared'], database)
    const second = await storeSeriesWatchMembers(other, ['shared'], database)
    await storeSeriesWatchSummary(target, { known: 1, watched: 1, upToDate: true }, {
      membersRevision: first.revision,
      stateRevision: 1,
    }, database)
    await storeSeriesWatchSummary(other, { known: 1, watched: 0, upToDate: false }, {
      membersRevision: second.revision,
      stateRevision: 1,
    }, database)

    const affected = await invalidateSeriesWatchByStableId('shared', database)
    expect(affected).toEqual(expect.arrayContaining([target, other]))
    expect(await readValidSeriesWatchSummary(target, 1, database)).toBeUndefined()
    expect(await readValidSeriesWatchSummary(other, 1, database)).toBeUndefined()
  })
})

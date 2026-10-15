import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord, type UserStateRecord } from './db'
import { buildStableId, getContinueWatching, getUserState, listPlayed } from './userStateRepository'
import { clearHistory, isInHistory, removeMovieFromHistory, summarizeHistory } from './historyRemoval'

const SOURCE_ID = 'fonte-1'

let database: CatalogDb
let clock = 1_000

beforeEach(async () => {
  clock = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  database = new CatalogDb(`test-history-removal-extra-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: SOURCE_ID,
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function record(overrides: Partial<CatalogRecord> & Pick<CatalogRecord, 'kind' | 'name'>): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, originalName: overrides.name, groupOrder: 0, ...overrides }
}

function state(stableId: string, patch: Partial<UserStateRecord>): UserStateRecord {
  return { stableId, sourceId: SOURCE_ID, isFavorite: false, createdAt: 0, updatedAt: 0, ...patch }
}

const movieId = (streamId: string) => buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: streamId })
const episodeId = (streamId: string) =>
  buildStableId({ sourceId: SOURCE_ID, kind: 'episode', providerStreamId: streamId, seasonNumber: 1, episodeNumber: 1 })

describe('isInHistory', () => {
  it('só com lastWatched, e só se a última reprodução for depois do esconder', () => {
    expect(isInHistory(undefined)).toBe(false)
    expect(isInHistory({})).toBe(false)
    expect(isInHistory({ lastWatched: 5 })).toBe(true)
    expect(isInHistory({ lastWatched: 5, historyHiddenAt: 5 })).toBe(false)
    expect(isInHistory({ lastWatched: 6, historyHiddenAt: 5 })).toBe(true)
  })
})

describe('removeMovieFromHistory', () => {
  it('item fora do Histórico (nunca reproduzido ou já escondido) é no-op', async () => {
    await database.userStates.bulkAdd([
      state(movieId('fav'), { isFavorite: true, favoritedAt: 10 }),
      state(movieId('hid'), { lastWatched: 50, historyHiddenAt: 60, progressSeconds: 30, updatedAt: 7 }),
    ])
    clock = 2_000
    await removeMovieFromHistory(movieId('fav'), SOURCE_ID, 'history-and-progress', database)
    await removeMovieFromHistory(movieId('hid'), SOURCE_ID, 'history-and-progress', database)

    expect(await getUserState(movieId('fav'), database)).toEqual(state(movieId('fav'), { isFavorite: true, favoritedAt: 10 }))
    expect(await getUserState(movieId('hid'), database)).toMatchObject({ progressSeconds: 30, updatedAt: 7 })
  })

  it('historyHiddenAt = max(agora, lastWatched): relógio atrasado não deixa o item no Histórico', async () => {
    await database.userStates.add(state(movieId('a'), { lastWatched: 5_000 }))
    clock = 2_000
    await removeMovieFromHistory(movieId('a'), SOURCE_ID, 'history-only', database)

    expect(await getUserState(movieId('a'), database)).toMatchObject({ historyHiddenAt: 5_000, lastWatched: 5_000 })
    expect(await listPlayed(SOURCE_ID, 'movie', database)).toEqual([])
  })
})

describe('clearHistory', () => {
  it("'both' + apagar progresso apaga também a retomada de item já escondido (D-005)", async () => {
    await database.userStates.bulkAdd([
      state(movieId('hid'), { lastWatched: 50, historyHiddenAt: 60, progressSeconds: 30 }),
      state(episodeId('e1'), { lastWatched: 70, progressSeconds: 40, completedAt: 65 }),
    ])
    clock = 2_000
    await clearHistory(SOURCE_ID, 'both', 'history-and-progress', database)

    expect(await getContinueWatching(SOURCE_ID, database)).toEqual([])
    expect(await getUserState(movieId('hid'), database)).toMatchObject({ historyHiddenAt: 60 })
    expect(await getUserState(episodeId('e1'), database)).toMatchObject({ completedAt: 65, lastWatched: 70, historyHiddenAt: 2_000 })
  })
})

describe('summarizeHistory', () => {
  it('títulos, indisponíveis e hasProgress por escopo; escopo vazio zera tudo', async () => {
    await database.channels.bulkAdd([
      record({ kind: 'movie', name: 'Alfa', providerStreamId: 'a' }),
      record({ kind: 'movie', name: 'Beta', providerStreamId: 'b' }),
    ])
    await database.userStates.bulkAdd([
      state(movieId('a'), { lastWatched: 100 }),
      state(movieId('b'), { lastWatched: 200, progressSeconds: 15 }),
      state(movieId('gone'), { lastWatched: 300 }),
      // Escondido com progresso: não conta como "tem progresso" no Histórico.
      state(movieId('hid'), { lastWatched: 50, historyHiddenAt: 60, progressSeconds: 9 }),
    ])

    const summary = await summarizeHistory(SOURCE_ID, database)
    expect(summary.movies).toEqual({ titles: 2, unavailable: 1, hasProgress: true })
    expect(summary.series).toEqual({ titles: 0, unavailable: 0, hasProgress: false })
  })
})

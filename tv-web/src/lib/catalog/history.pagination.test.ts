import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord, type UserStateRecord } from './db'
import { buildStableId } from './userStateRepository'
import { loadFavoritesPage, loadHistoryPage } from './history'

const SOURCE_ID = 'history-pages'
let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-history-pages-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})

afterEach(async () => database.delete())

function movie(streamId: string, name: string): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind: 'movie', name, originalName: name, groupOrder: 0, providerStreamId: streamId }
}

function state(stableId: string, patch: Partial<UserStateRecord>): UserStateRecord {
  return { stableId, sourceId: SOURCE_ID, isFavorite: false, createdAt: 0, updatedAt: 0, ...patch }
}

describe('janelas de histórico/favoritos', () => {
  it('resolve somente a página pedida e conserva o cursor', async () => {
    await database.channels.bulkAdd([movie('a', 'A'), movie('b', 'B'), movie('c', 'C')])
    await database.userStates.bulkAdd([
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'a' }), { lastWatched: 300 }),
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'b' }), { lastWatched: 200 }),
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'c' }), { lastWatched: 100 }),
    ])

    const page = await loadHistoryPage(SOURCE_ID, 'movie', 0, 2, database)

    expect(page.records.map((record) => record.name)).toEqual(['A', 'B'])
    expect(page.total).toBe(3)
    expect(page.nextOffset).toBe(2)
  })

  it('pagina favoritos e preserva não resolvidos', async () => {
    await database.channels.add(movie('a', 'A'))
    await database.userStates.bulkAdd([
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'a' }), { isFavorite: true, favoritedAt: 200 }),
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'missing' }), { isFavorite: true, favoritedAt: 100 }),
    ])

    const page = await loadFavoritesPage(SOURCE_ID, 'movie', 0, 1, database)

    expect(page.records.map((record) => record.name)).toEqual(['A'])
    expect(page.unresolved).toBe(0)
    expect(page.nextOffset).toBe(1)
  })
})

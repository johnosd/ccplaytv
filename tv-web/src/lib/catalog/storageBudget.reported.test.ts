import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { makeRoomFor } from './storageBudget'

describe('makeRoomFor com uso físico reportado', () => {
  let database: CatalogDb | undefined

  afterEach(async () => {
    vi.unstubAllGlobals()
    await database?.delete()
    database = undefined
  })

  it('libera um cache refazível quando a estimativa já passou da reserva, mesmo com ledger pequeno', async () => {
    database = new CatalogDb(`reported-${Math.random().toString(36).slice(2)}`)
    await database.open()
    await database.sources.bulkAdd([
      { id: 'ativa', type: 'm3u_url', displayName: 'Ativa', connectionState: 'synced', createdAt: 1, updatedAt: 1 },
      { id: 'inativa', type: 'm3u_url', displayName: 'Inativa', connectionState: 'synced', createdAt: 1, updatedAt: 1 },
    ])
    await database.categories.add({
      sourceId: 'inativa', generation: 1, kind: 'movie', order: 0, fetchMode: 'on_demand',
      itemsCount: 1, itemsFetchedAt: 1, storedBytes: 100,
    })
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn(async () => ({ usage: 79 * 1024 * 1024, quota: 80 * 1024 * 1024 })) },
    })

    const result = await makeRoomFor('ativa', 1, { database, mode: 'prefetch' })

    expect(result.released.map((candidate) => candidate.sourceId)).toEqual(['inativa'])
    expect(result.fits).toBe(true)
  })
})

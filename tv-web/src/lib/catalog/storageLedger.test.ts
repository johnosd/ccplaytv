import { describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { catalogLedger, categoryStoredBytes } from './storageLedger'

describe('storageLedger', () => {
  it('soma o formato legado e o formato comprimido sem ler pedaços', async () => {
    const database = new CatalogDb(`ledger-${Math.random()}`); await database.open()
    await database.sources.add({ id: 's', type: 'provider_credentials', displayName: 'S', connectionState: 'synced', createdAt: 1, updatedAt: 1, epgStoredBytes: 42 })
    const id = await database.categories.add({ sourceId: 's', generation: 1, kind: 'movie', fetchMode: 'on_demand', order: 0, itemsCount: 2 })
    expect(await categoryStoredBytes(database, id as number)).toBe(640)
    expect(await catalogLedger(database)).toEqual({ total: 682, bySource: { s: 682 } })
    await database.delete()
  })
})

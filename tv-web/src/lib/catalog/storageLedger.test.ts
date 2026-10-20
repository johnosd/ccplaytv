import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { storeCategories, storeCategoryItems } from './catalogRepository'
import { catalogLedger, categoryStoredBytes, LEGACY_EPG_ROW_BYTES, LEGACY_ITEM_BYTES } from './storageLedger'
import { categoryChunks } from './chunkTables'

/** Feature 082, T031: a conta própria bate com os bytes gravados nos dois formatos, sem carregar pedaços. */

let database: CatalogDb
beforeEach(async () => {
  database = new CatalogDb(`ledger-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: 's', type: 'provider_credentials', displayName: 'S', connectionState: 'synced', activeGeneration: 1,
    createdAt: 1, updatedAt: 1, epgStoredBytes: 42 })
})
afterEach(async () => { vi.restoreAllMocks(); await database.delete() })

describe('storageLedger', () => {
  it('formato 2: a conta é a soma dos pedaços gravados (+ cabeçalho); formato antigo: estimativa por item', async () => {
    const [compressed, legacy] = await storeCategories([
      { sourceId: 's', generation: 1, kind: 'movie', fetchMode: 'on_demand', order: 0, providerCategoryId: '1', name: 'A' },
      { sourceId: 's', generation: 1, kind: 'movie', fetchMode: 'on_demand', order: 1, providerCategoryId: '2', name: 'B' },
    ], database)
    await storeCategoryItems({ sourceId: 's', generation: 1, kind: 'movie', groupOrder: 0, categoryId: compressed },
      Array.from({ length: 700 }, (_, index) => ({ sourceId: 's', generation: 1, kind: 'movie' as const, groupOrder: 0,
        name: `F${index}`, originalName: `F${index}`, providerStreamId: String(index) })), 1, database)
    await database.categories.update(legacy, { itemsCount: 2 })
    // Formato antigo de verdade (linhas da 039); sem elas a categoria seria "órfã" e não ocuparia nada.
    await database.channels.bulkAdd(['L1', 'L2'].map((name) => ({ sourceId: 's', generation: 1, kind: 'movie' as const, groupOrder: 1, name, originalName: name })))
    await database.epgPrograms.add({ sourceId: 's', generation: 1, channelKey: 'c', start: 0, end: 1, title: 't' })
    await database.channels.add({ sourceId: 's', generation: 1, kind: 'episode', groupOrder: 5, name: 'E', originalName: 'E' })

    const chunkBytes = (await categoryChunks(database).toArray()).reduce((sum, row) => sum + row.bytes.byteLength, 0)
    const stored = await categoryStoredBytes(database, compressed)
    expect(stored).toBeGreaterThanOrEqual(chunkBytes)
    expect(stored - chunkBytes).toBeLessThanOrEqual(512)
    expect(await categoryStoredBytes(database, legacy)).toBe(2 * LEGACY_ITEM_BYTES)

    const read = vi.spyOn(categoryChunks(database), 'toArray')
    const get = vi.spyOn(categoryChunks(database), 'bulkGet')
    const blocks = vi.spyOn(database.categoryBlocks, 'toArray')
    const ledger = await catalogLedger(database)
    expect(read).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(blocks).not.toHaveBeenCalled()
    const expected = stored + 2 * LEGACY_ITEM_BYTES + 42 + LEGACY_EPG_ROW_BYTES + LEGACY_ITEM_BYTES
    expect(ledger.total).toBe(expected)
    expect(ledger.bySource).toEqual({ s: expected })
    expect(ledger.byCategory.get(compressed)).toBe(stored)

    // Órfã (carimbada sem itens, liberada com o banco cheio): não entra na conta.
    await database.channels.where('[sourceId+generation+kind+groupOrder]').equals(['s', 1, 'movie', 1]).delete()
    expect((await catalogLedger(database)).byCategory.get(legacy)).toBe(0)
  })
})

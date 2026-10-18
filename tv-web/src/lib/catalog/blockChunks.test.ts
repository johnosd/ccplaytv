import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { deleteCategoryItems, readBlockChunks, writeCompressedBlock } from './blockChunks'

describe('blockChunks', () => {
  let database: CatalogDb
  beforeEach(async () => { database = new CatalogDb(`chunks-${Math.random()}`); await database.open(); await database.sources.add({ id: 's', type: 'provider_credentials', displayName: 'S', connectionState: 'synced', createdAt: 1, updatedAt: 1 }) })
  afterEach(async () => { await database.delete() })
  it('grava, lê uma janela e apaga só a categoria', async () => {
    await database.categories.bulkAdd([
      { sourceId: 's', generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'A', order: 0 },
      { sourceId: 's', generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'B', order: 1 },
    ])
    const [a, b] = await database.categories.toArray()
    await writeCompressedBlock({ categoryId: a.id as number, sourceId: 's', generation: 1, kind: 'movie', groupOrder: 0 }, Array.from({ length: 501 }, (_, id) => ({ sourceId: 's', generation: 1, kind: 'movie' as const, groupOrder: 0, categoryId: a.id, name: `A${id}`, originalName: `A${id}`, id: -id - 1 })), 10, database)
    await writeCompressedBlock({ categoryId: b.id as number, sourceId: 's', generation: 1, kind: 'movie', groupOrder: 1 }, [{ sourceId: 's', generation: 1, kind: 'movie', groupOrder: 1, categoryId: b.id, name: 'B', originalName: 'B', id: -900 }], 10, database)
    expect((await readBlockChunks(database, a.id as number, 499, 501)).map((row) => row.name)).toEqual(['A499', 'A500'])
    await deleteCategoryItems(database, a.id as number)
    expect(await database.categoryBlocks.get(a.id as number)).toBeUndefined()
    expect(await database.categoryBlocks.get(b.id as number)).toBeDefined()
  })
})

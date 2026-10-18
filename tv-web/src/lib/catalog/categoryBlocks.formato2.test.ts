import { describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { listChannels, storeCategories, storeCategoryItems } from './catalogRepository'
import { readCategoryWindow } from './categoryWindow'

describe('formato 2 e fallback legado', () => {
  it('lista e janela preservam a ordem e os ids após a gravação comprimida', async () => {
    const database = new CatalogDb(`formato2-${Math.random()}`)
    await database.open()
    await database.sources.add({ id: 's', type: 'provider_credentials', displayName: 'S', connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
    const [categoryId] = await storeCategories([{ sourceId: 's', generation: 1, kind: 'movie', order: 0, fetchMode: 'on_demand', providerCategoryId: '1', name: 'A' }], database)
    const items = Array.from({ length: 12 }, (_, index) => ({ sourceId: 's', generation: 1, kind: 'movie' as const, groupOrder: 0, categoryId, name: `N${index}`, originalName: `N${index}`, providerStreamId: String(index) }))
    await storeCategoryItems({ sourceId: 's', generation: 1, kind: 'movie', groupOrder: 0, categoryId }, items, 2, database)
    expect((await database.categoryBlocks.get(categoryId))?.format).toBe(2)
    const all = await listChannels('s', 0, 0, 20, 'movie', database)
    expect((await readCategoryWindow('s', categoryId, 3, 4, database)).items.map((item) => item.id)).toEqual(all.slice(3, 7).map((item) => item.id))
    await database.delete()
  })
})

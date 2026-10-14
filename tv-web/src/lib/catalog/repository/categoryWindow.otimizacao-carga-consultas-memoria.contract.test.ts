import { expect, it, vi } from 'vitest'
import { CatalogDb } from '../db'
import { listChannels, storeCategories, storeCategoryItems } from '../catalogRepository'
import { prepareCategoryReadModel, readCategoryWindow } from './categoryWindow'

it('FR-016/FR-018 US3-AC1: janela preparada mantém ids/ordem sem ler bloco completo e alcança o fim', async () => {
  const database = new CatalogDb(`test-065-window-${Math.random().toString(36).slice(2)}`)
  await database.open()
  const sourceId = 'fonte'
  try {
    await database.sources.add({ id: sourceId, type: 'provider_credentials', displayName: 'Lista',
      connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
    const [categoryId] = await storeCategories([{ sourceId, generation: 1, kind: 'movie', order: 0,
      fetchMode: 'on_demand', providerCategoryId: '1' }], database)
    const target = { sourceId, generation: 1, kind: 'movie' as const, groupOrder: 0, categoryId }
    await storeCategoryItems(target, Array.from({ length: 1_200 }, (_, index) => ({
      sourceId, generation: 1, kind: 'movie' as const, groupOrder: 0,
      name: `Filme ${index}`, originalName: `Filme ${index}`, providerStreamId: String(index),
    })), 100, database)
    const reference = await listChannels(sourceId, 0, 0, 1_200, 'movie', database)
    await prepareCategoryReadModel(sourceId, categoryId, database)
    const blockGet = vi.spyOn(database.categoryBlocks, 'get')
    const first = await readCategoryWindow(sourceId, categoryId, 0, 12, database)
    const last = await readCategoryWindow(sourceId, categoryId, 1_188, 12, database)
    expect(first.items.map((item) => item.id)).toEqual(reference.slice(0, 12).map((item) => item.id))
    expect(last.items.map((item) => item.name)).toEqual(reference.slice(1_188).map((item) => item.name))
    expect(first.total).toBe(1_200)
    expect(first.nextOffset).toBe(12)
    expect(last.nextOffset).toBeUndefined()
    expect(blockGet).not.toHaveBeenCalled()
    blockGet.mockRestore()
  } finally {
    vi.restoreAllMocks()
    await database.delete()
  }
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import {
  listCategories,
  listChannels,
  renewCategoryItems,
  StorageFullError,
  storeCategories,
} from './catalogRepository'

let database: CatalogDb
const SOURCE_ID = 'fonte-1'

beforeEach(async () => {
  database = new CatalogDb(`test-renovacao-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'm3u_url',
    displayName: 'Lista',
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

function channel(name: string): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind: 'channel', name, originalName: name, groupOrder: 0 }
}

async function seedCategory(order = 0, position?: number): Promise<number> {
  const [id] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'channel', fetchMode: 'stored', name: `Grupo ${order}`, order }],
    database,
  )
  if (position !== undefined) await database.categories.update(id, { position })
  return id
}

describe('renewCategoryItems (feature 038)', () => {
  it('M3U com nomes repetidos casa em ordem, sem perder nem duplicar (R-005)', async () => {
    const categoryId = await seedCategory()
    const target = { sourceId: SOURCE_ID, generation: 1, kind: 'channel' as const, categoryId, groupOrder: 0 }
    await renewCategoryItems(target, [channel('Canal HD'), channel('Canal HD'), channel('Outro')], 1, database)
    const before = await listChannels(SOURCE_ID, 0, 0, 100, 'channel', database)

    await renewCategoryItems(target, [channel('Canal HD'), channel('Outro'), channel('Canal HD')], 2, database)
    const after = await listChannels(SOURCE_ID, 0, 0, 100, 'channel', database)

    expect(after.map((r) => r.name)).toEqual(['Canal HD', 'Outro', 'Canal HD'])
    expect(new Set(after.map((r) => r.id))).toEqual(new Set(before.map((r) => r.id)))
  })

  it('categoria vazia conta como carregada, com 0 itens', async () => {
    const categoryId = await seedCategory()
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'channel', categoryId, groupOrder: 0 }, [], 5, database)
    const category = await database.categories.get(categoryId)
    expect(category?.itemsFetchedAt).toBe(5)
    expect(category?.itemsCount).toBe(0)
  })

  it('falta de espaço vira StorageFullError', async () => {
    const categoryId = await seedCategory()
    const quota = Object.assign(new Error('cheio'), { name: 'QuotaExceededError' })
    vi.spyOn(database.categoryBlocks, 'put').mockRejectedValue(quota)
    await expect(
      renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'channel', categoryId, groupOrder: 0 }, [channel('A')], 1, database),
    ).rejects.toBeInstanceOf(StorageFullError)
  })
})

describe('listCategories (feature 038, D-005)', () => {
  it('ordena pela posição de exibição, com `order` como reserva', async () => {
    const a = await seedCategory(0, 2)
    const b = await seedCategory(1) // sem posição: usa order 1
    const c = await seedCategory(5, 0)
    const ids = (await listCategories(SOURCE_ID, 'channel', database)).map((category) => category.id)
    expect(ids).toEqual([c, b, a])
  })
})

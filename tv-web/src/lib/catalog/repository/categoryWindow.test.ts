import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from '../db'
import { readCategoryWindow, READ_WINDOW_MIN_ITEMS } from './categoryWindow'
import { storeCategories, storeCategoryItems } from '../catalogRepository'
import { convertLegacyCategories } from '../categoryBlocks'

let database: CatalogDb
const SOURCE_ID = 'category-window-tests'

beforeEach(async () => {
  database = new CatalogDb(`test-category-window-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Lista',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
})

afterEach(async () => {
  await database.delete()
})

function movie(name: string): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    name,
    originalName: name,
    groupOrder: 0,
    providerStreamId: name,
  }
}

/** Categoria grande (lida por janela na grade, 065); os nomes seguem a posição. */
const BIG = READ_WINDOW_MIN_ITEMS
const names = (prefix: string) => Array.from({ length: BIG }, (_, index) => `${prefix}${index}`)

// Feature 082 (D-004): a janela vem dos pedaços comprimidos; a projeção 065 não é mais gravada.
describe('categoryWindow', () => {
  it('linhas legadas: a janela segue a ordem antes e depois da conversão', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes', order: 0 }],
      database,
    )
    // Gravadas fora de ordem: a janela segue `categoryPosition`.
    await database.channels.bulkAdd(names('L').map((name, index) => ({ ...movie(name), categoryId, categoryPosition: index })).reverse())
    await database.categories.update(categoryId, { itemsCount: BIG })

    const legacy = await readCategoryWindow(SOURCE_ID, categoryId, BIG - 1, 2, database)
    expect(legacy.items.map((item) => item.name)).toEqual([`L${BIG - 1}`])
    expect(legacy.total).toBe(BIG)

    expect(await convertLegacyCategories(SOURCE_ID, {}, database)).toBe(false)
    const window = await readCategoryWindow(SOURCE_ID, categoryId, BIG - 1, 2, database)
    expect(window.items.map((item) => item.name)).toEqual([`L${BIG - 1}`])
    expect(window.total).toBe(BIG)
    expect(window.nextOffset).toBeUndefined()
    expect(await database.channels.count()).toBe(0)
    expect(await database.catalogReadManifests.count()).toBe(0)
  }, 20_000) // mil linhas legadas no fake-indexeddb passam de 5 s com a suíte em paralelo

  it('renovação com a mesma contagem: a janela mostra o conteúdo novo (nada velho pelo cache)', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes', order: 0 }],
      database,
    )
    const target = { sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, categoryId, groupOrder: 0 }
    await storeCategoryItems(target, names('A').map(movie), 10, database)
    const first = await database.categoryBlocks.get(categoryId)
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 2, database)).items.map((item) => item.name)).toEqual(['A0', 'A1'])

    await storeCategoryItems(target, ['A0', ...names('C').slice(1)].map(movie), 20, database)
    const second = await database.categoryBlocks.get(categoryId)
    const window = await readCategoryWindow(SOURCE_ID, categoryId, 0, 2, database)

    expect(second?.revision).toBeDefined()
    expect(second?.revision).not.toBe(first?.revision)
    expect(second?.count).toBe(first?.count)
    expect(window.items.map((item) => item.name)).toEqual(['A0', 'C1'])
    expect(await database.catalogReadManifests.count()).toBe(0)
  })

  it('não lê uma categoria de geração que deixou de ser ativa', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes', order: 0 }],
      database,
    )
    await storeCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 },
      [movie('A')],
      10,
      database,
    )
    await database.sources.update(SOURCE_ID, { activeGeneration: 2 })

    expect(await readCategoryWindow(SOURCE_ID, categoryId, 0, 10, database)).toEqual({ items: [], total: 0 })
  })
})

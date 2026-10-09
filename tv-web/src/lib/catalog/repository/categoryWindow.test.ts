import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from '../db'
import { prepareCategoryReadModel, readCategoryWindow, READ_WINDOW_MIN_ITEMS } from './categoryWindow'
import { storeCategories, storeCategoryItems } from '../catalogRepository'

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

/** Só categoria grande tem projeção (065); os nomes seguem a posição. */
const BIG = READ_WINDOW_MIN_ITEMS
const names = (prefix: string) => Array.from({ length: BIG }, (_, index) => `${prefix}${index}`)

describe('categoryWindow', () => {
  it('prepara linhas legadas e preserva a ordem na janela final', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes', order: 0 }],
      database,
    )
    // Gravadas fora de ordem: a janela segue `categoryPosition`.
    await database.channels.bulkAdd(names('L').map((name, index) => ({ ...movie(name), categoryId, categoryPosition: index })).reverse())

    await prepareCategoryReadModel(SOURCE_ID, categoryId, database)
    const window = await readCategoryWindow(SOURCE_ID, categoryId, BIG - 1, 2, database)

    expect(window.items.map((item) => item.name)).toEqual([`L${BIG - 1}`])
    expect(window.total).toBe(BIG)
    expect(window.nextOffset).toBeUndefined()
    expect(await database.channels.count()).toBe(BIG)
  }, 20_000) // mil linhas legadas no fake-indexeddb passam de 5 s com a suíte em paralelo

  it('publica uma nova revisão quando a categoria muda mantendo a mesma contagem', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes', order: 0 }],
      database,
    )
    const target = { sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, categoryId, groupOrder: 0 }
    await storeCategoryItems(target, names('A').map(movie), 10, database)
    const first = await database.catalogReadManifests.get(categoryId)

    await storeCategoryItems(target, ['A0', ...names('C').slice(1)].map(movie), 20, database)
    const second = await database.catalogReadManifests.get(categoryId)
    const window = await readCategoryWindow(SOURCE_ID, categoryId, 0, 2, database)

    expect(first?.revision).toBeDefined()
    expect(second?.revision).toBeDefined()
    expect(second?.revision).not.toBe(first?.revision)
    expect(second?.count).toBe(first?.count)
    expect(window.items.map((item) => item.name)).toEqual(['A0', 'C1'])
  })

  it('não lê uma projeção de geração que deixou de ser ativa', async () => {
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

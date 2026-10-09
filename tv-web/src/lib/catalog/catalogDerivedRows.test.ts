import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { iterateKindDerivedRows } from './catalogDerivedRows'
import { renewCategoryItems, storeCategories } from './catalogRepository'

let database: CatalogDb
const SOURCE_ID = 'derived-source'

beforeEach(async () => {
  database = new CatalogDb(`test-derived-${Math.random().toString(36).slice(2)}`)
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
  await database.delete()
})

function movie(name: string, groupOrder: number, extra: Partial<CatalogRecord> = {}): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    name,
    originalName: name,
    groupOrder,
    ...extra,
  }
}

describe('iterateKindDerivedRows', () => {
  it('percorre categorias em páginas e não retém URLs no modelo derivado', async () => {
    const [first, second] = await storeCategories(
      [
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'stored', name: 'A', order: 0 },
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'stored', name: 'B', order: 1 },
      ],
      database,
    )
    await renewCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: first, groupOrder: 0 },
      [movie('Filme A', 0, { directUrl: 'https://provider.invalid/a', year: 2024 })],
      1,
      database,
    )
    await renewCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: second, groupOrder: 1 },
      [movie('Filme B', 1, { providerStreamId: 'b', providerRating: 8.5 })],
      1,
      database,
    )

    const rows = []
    for await (const row of iterateKindDerivedRows(SOURCE_ID, 'movie', { pageSize: 1, database })) rows.push(row)

    expect(rows).toMatchObject([
      { title: 'Filme A', year: 2024, hasPlayback: true, categoryId: first },
      { title: 'Filme B', providerRating: 8.5, hasPlayback: true, categoryId: second },
    ])
    expect(rows[0]).not.toHaveProperty('directUrl')
    expect(rows[0]).not.toHaveProperty('providerStreamId')
  })

  it('interrompe entre blocos', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'stored', name: 'A', order: 0 }],
      database,
    )
    await renewCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 },
      [movie('Filme', 0)],
      1,
      database,
    )
    const controller = new AbortController()
    controller.abort()
    const iterator = iterateKindDerivedRows(SOURCE_ID, 'movie', { database, signal: controller.signal })
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' })
  })
})

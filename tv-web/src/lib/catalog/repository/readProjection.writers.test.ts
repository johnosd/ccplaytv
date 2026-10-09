import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord, type SourceRecord } from '../db'
import { convertLegacyCategories } from '../categoryBlocks'
import {
  deleteAllForSource,
  publishGeneration,
  storeCategories,
  storeCategoryItems,
  type NewCategory,
} from '../catalogRepository'
import { prepareCategoryReadModel, readCategoryWindow, READ_WINDOW_MIN_ITEMS } from '../categoryWindow'
import { StorageFullError } from './shared'

let database: CatalogDb
const SOURCE_ID = 'projection-writer-source'

beforeEach(async () => {
  database = new CatalogDb(`test-read-projection-writers-${Math.random().toString(36).slice(2)}`)
  await database.open()
  const source: SourceRecord = {
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  }
  await database.sources.add(source)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function category(generation = 1): NewCategory {
  return { sourceId: SOURCE_ID, generation, kind: 'movie', fetchMode: 'on_demand', order: 0, name: 'Filmes' }
}

function movie(name: string, generation = 1): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation,
    kind: 'movie',
    name,
    originalName: name,
    groupOrder: 0,
    providerStreamId: name,
    directUrl: `https://play.invalid/${name}`,
  }
}

/** Categoria grande o bastante para ter projeção (feature 065: as pequenas leem o bloco inteiro). */
const BIG = READ_WINDOW_MIN_ITEMS
const CHUNKS = Math.ceil(BIG / 240)
function movies(prefix: string, generation = 1): CatalogRecord[] {
  return Array.from({ length: BIG }, (_, index) => movie(`${prefix} ${index}`, generation))
}

describe('writers da projeção de leitura', () => {
  it('atualiza a projeção junto com a renovação canônica', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('um'), 10, database)
    await prepareCategoryReadModel(SOURCE_ID, categoryId, database)
    expect(await database.catalogReadManifests.get(categoryId)).toMatchObject({ ready: true, count: BIG })
    expect(await database.catalogReadChunks.count()).toBe(CHUNKS)

    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('dois'), 20, database)

    expect(await database.catalogReadManifests.get(categoryId)).toMatchObject({ ready: true, count: BIG })
    expect(await database.catalogReadChunks.count()).toBe(CHUNKS)
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 2, database)).items.map((item) => item.name)).toEqual(['dois 0', 'dois 1'])
  })

  it('mantém projeção e canônico quando a escrita canônica falha por quota', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('um'), 10, database)
    await prepareCategoryReadModel(SOURCE_ID, categoryId, database)
    const manifest = await database.catalogReadManifests.get(categoryId)
    const put = vi.spyOn(database.categoryBlocks, 'put').mockRejectedValue(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))

    await expect(
      storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('dois'), 20, database),
    ).rejects.toBeInstanceOf(StorageFullError)
    put.mockRestore()

    expect(await database.catalogReadManifests.get(categoryId)).toEqual(manifest)
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 1, database)).items.map((item) => item.name)).toEqual(['um 0'])
  })

  it('limpa projeções de gerações antigas ao publicar e de toda a fonte ao remover', async () => {
    const [oldCategoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: oldCategoryId, groupOrder: 0 }, movies('antigo'), 10, database)
    await prepareCategoryReadModel(SOURCE_ID, oldCategoryId, database)

    const [newCategoryId] = await storeCategories([category(2)], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 2, kind: 'movie', categoryId: newCategoryId, groupOrder: 0 }, movies('novo', 2), 20, database)
    await publishGeneration(SOURCE_ID, 2, database)
    await prepareCategoryReadModel(SOURCE_ID, newCategoryId, database)

    expect(await database.catalogReadManifests.get(oldCategoryId)).toBeUndefined()
    expect(await database.catalogReadManifests.get(newCategoryId)).toMatchObject({ generation: 2, ready: true })

    await deleteAllForSource(SOURCE_ID, database)
    expect(await database.catalogReadManifests.count()).toBe(0)
    expect(await database.catalogReadChunks.count()).toBe(0)
  })

  it('prepara a projeção ao converter linhas legadas', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await database.channels.bulkAdd(movies('legado').map((record, index) => ({ ...record, id: 17 + index, categoryId, categoryPosition: index })))

    expect(await convertLegacyCategories(SOURCE_ID, {}, database)).toBe(false)

    expect(await database.catalogReadManifests.get(categoryId)).toMatchObject({ ready: true, count: BIG })
    expect((await readCategoryWindow(SOURCE_ID, categoryId, BIG - 1, 10, database)).items.map((item) => item.name)).toEqual([`legado ${BIG - 1}`])
  }, 20_000) // mil linhas legadas no fake-indexeddb passam de 5 s com a suíte em paralelo

  it('categoria pequena não ganha projeção, e a projeção antiga dela é apagada quando ela encolhe (065, T057)', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('grande'), 10, database)
    await prepareCategoryReadModel(SOURCE_ID, categoryId, database)
    expect(await database.catalogReadChunks.count()).toBe(CHUNKS)

    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, [movie('único')], 20, database)
    await prepareCategoryReadModel(SOURCE_ID, categoryId, database)

    expect(await database.catalogReadManifests.get(categoryId)).toBeUndefined()
    expect(await database.catalogReadChunks.count()).toBe(0)
    expect(await database.categoryBlocks.get(categoryId)).toMatchObject({ items: [expect.objectContaining({ name: 'único' })] })
  })
})

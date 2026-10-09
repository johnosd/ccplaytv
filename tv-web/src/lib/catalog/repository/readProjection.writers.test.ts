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
import { prepareCategoryReadModel, readCategoryWindow } from '../categoryWindow'
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

describe('writers da projeção de leitura', () => {
  it('atualiza a projeção junto com a renovação canônica', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, [movie('um')], 10, database)
    await prepareCategoryReadModel(SOURCE_ID, categoryId, database)
    expect(await database.catalogReadManifests.get(categoryId)).toMatchObject({ ready: true, count: 1 })
    expect(await database.catalogReadChunks.count()).toBe(1)

    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, [movie('dois')], 20, database)

    expect(await database.catalogReadManifests.get(categoryId)).toMatchObject({ ready: true, count: 1 })
    expect(await database.catalogReadChunks.count()).toBe(1)
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 10, database)).items.map((item) => item.name)).toEqual(['dois'])
  })

  it('mantém projeção e canônico quando a escrita canônica falha por quota', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, [movie('um')], 10, database)
    await prepareCategoryReadModel(SOURCE_ID, categoryId, database)
    const manifest = await database.catalogReadManifests.get(categoryId)
    const put = vi.spyOn(database.categoryBlocks, 'put').mockRejectedValue(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))

    await expect(
      storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, [movie('dois')], 20, database),
    ).rejects.toBeInstanceOf(StorageFullError)
    put.mockRestore()

    expect(await database.catalogReadManifests.get(categoryId)).toEqual(manifest)
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 10, database)).items.map((item) => item.name)).toEqual(['um'])
  })

  it('limpa projeções de gerações antigas ao publicar e de toda a fonte ao remover', async () => {
    const [oldCategoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: oldCategoryId, groupOrder: 0 }, [movie('antigo')], 10, database)
    await prepareCategoryReadModel(SOURCE_ID, oldCategoryId, database)

    const [newCategoryId] = await storeCategories([category(2)], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 2, kind: 'movie', categoryId: newCategoryId, groupOrder: 0 }, [movie('novo', 2)], 20, database)
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
    await database.channels.add({ ...movie('legado'), id: 17, categoryId, categoryPosition: 0 })

    expect(await convertLegacyCategories(SOURCE_ID, {}, database)).toBe(false)

    expect(await database.catalogReadManifests.get(categoryId)).toMatchObject({ ready: true, count: 1 })
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 10, database)).items.map((item) => item.name)).toEqual(['legado'])
  })
})

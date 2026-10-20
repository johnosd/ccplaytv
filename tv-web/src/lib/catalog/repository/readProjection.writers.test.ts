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
import { prepareCategoryReadModel, prepareMissingReadModels, readCategoryWindow, READ_WINDOW_MIN_ITEMS } from '../categoryWindow'
import { categoryChunks } from '../chunkTables'
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

/** Categoria grande (a grade lê por janela, 065). */
const BIG = READ_WINDOW_MIN_ITEMS
function movies(prefix: string, generation = 1): CatalogRecord[] {
  return Array.from({ length: BIG }, (_, index) => movie(`${prefix} ${index}`, generation))
}

const chunksOf = async (generation: number) =>
  (await categoryChunks(database).toArray()).filter((row) => row.generation === generation).length

// Feature 082 (D-004): os gravadores não gravam mais a projeção 065 — os pedaços comprimidos dão a janela.
describe('gravadores × projeção de leitura (feature 082)', () => {
  it('a renovação canônica nunca grava projeção, e a janela mostra o conteúdo renovado', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('um'), 10, database)
    await prepareCategoryReadModel(SOURCE_ID, categoryId, database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('dois'), 20, database)

    expect(await database.catalogReadManifests.count()).toBe(0)
    expect(await database.catalogReadChunks.count()).toBe(0)
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 2, database)).items.map((item) => item.name)).toEqual(['dois 0', 'dois 1'])
  })

  it('escrita que falha por quota não deixa meia gravação: a janela continua com o conteúdo anterior', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('um'), 10, database)
    const header = await database.categoryBlocks.get(categoryId)
    const put = vi.spyOn(categoryChunks(database), 'bulkPut').mockRejectedValue(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))

    await expect(
      storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('dois'), 20, database),
    ).rejects.toBeInstanceOf(StorageFullError)
    put.mockRestore()

    expect(await database.categoryBlocks.get(categoryId)).toEqual(header)
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 1, database)).items.map((item) => item.name)).toEqual(['um 0'])
    expect((await readCategoryWindow(SOURCE_ID, categoryId, BIG - 1, 1, database)).items.map((item) => item.name)).toEqual([`um ${BIG - 1}`])
  })

  it('publicar apaga os pedaços das gerações antigas e mantém os da nova; remover a fonte apaga tudo', async () => {
    const [oldCategoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: oldCategoryId, groupOrder: 0 }, movies('antigo'), 10, database)

    const [newCategoryId] = await storeCategories([category(2)], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 2, kind: 'movie', categoryId: newCategoryId, groupOrder: 0 }, movies('novo', 2), 20, database)
    await publishGeneration(SOURCE_ID, 2, database)

    expect(await chunksOf(1)).toBe(0)
    expect(await chunksOf(2)).toBeGreaterThan(0)
    expect((await readCategoryWindow(SOURCE_ID, newCategoryId, 0, 1, database)).items.map((item) => item.name)).toEqual(['novo 0'])

    await deleteAllForSource(SOURCE_ID, database)
    expect(await categoryChunks(database).count()).toBe(0)
    expect(await database.catalogReadManifests.count()).toBe(0)
  })

  it('converter linhas legadas grava o formato comprimido, sem projeção', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await database.channels.bulkAdd(movies('legado').map((record, index) => ({ ...record, id: 17 + index, categoryId, categoryPosition: index })))

    expect(await convertLegacyCategories(SOURCE_ID, {}, database)).toBe(false)

    expect(await database.categoryBlocks.get(categoryId)).toMatchObject({ format: 2, count: BIG })
    expect(await database.catalogReadManifests.count()).toBe(0)
    expect((await readCategoryWindow(SOURCE_ID, categoryId, BIG - 1, 10, database)).items.map((item) => item.name)).toEqual([`legado ${BIG - 1}`])
  }, 20_000) // mil linhas legadas no fake-indexeddb passam de 5 s com a suíte em paralelo

  it('a projeção antiga de uma categoria já convertida sai na limpeza em segundo plano (065 → 082)', async () => {
    const [categoryId] = await storeCategories([category()], database)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, movies('grande'), 10, database)
    // Sobra de uma versão anterior do app: manifesto + pedaço da projeção.
    await database.catalogReadManifests.put({ categoryId, sourceId: SOURCE_ID, generation: 1, kind: 'movie', revision: 'r', formatVersion: 1,
      count: BIG, chunkSize: 240, chunkCount: 1, ready: true })
    await database.catalogReadChunks.add({ id: [categoryId, 'r', 0], categoryId, sourceId: SOURCE_ID, generation: 1, kind: 'movie', revision: 'r', chunk: 0, items: [] })

    // A janela já não lê a projeção (formato 2 vem primeiro)…
    expect((await readCategoryWindow(SOURCE_ID, categoryId, 0, 1, database)).items.map((item) => item.name)).toEqual(['grande 0'])
    // …e a limpeza a apaga.
    expect(await prepareMissingReadModels(SOURCE_ID, database)).toBe(true)
    expect(await database.catalogReadManifests.count()).toBe(0)
    expect(await database.catalogReadChunks.count()).toBe(0)
    expect(await prepareMissingReadModels(SOURCE_ID, database)).toBe(false)
  })
})

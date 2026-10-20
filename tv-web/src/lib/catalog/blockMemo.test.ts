import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import {
  clearStagedItemsOfOtherSources,
  getChannel,
  listChannels,
  publishGeneration,
  renewCategoryItems,
  resolveFavorites,
  storeCategories,
  storeCategoryItems,
  storeSeriesEpisodes,
} from './catalogRepository'
import { blockKeysOutsideGeneration, convertLegacyCategories } from './categoryBlocks'
import { noteBlockWrite, readBlock } from './blockMemo'
import { categoryChunks } from './chunkTables'
import { buildStableId, parseStableId, type StableIdParts } from './userStateRepository'

/**
 * Correções do code review da feature 039: id antigo depois da conversão,
 * cache curto de blocos, favoritos repetidos, carimbo de episódios sem
 * regravar o bloco, limpeza de gerações pelo índice e preparo de outra lista.
 */

let database: CatalogDb
const SOURCE_ID = 'fonte-memo'

beforeEach(async () => {
  database = new CatalogDb(`test-block-memo-${Math.random().toString(36).slice(2)}`)
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
  vi.restoreAllMocks()
  await database.delete()
})

function movie(id: string, name: string, generation = 1): CatalogRecord {
  return { sourceId: SOURCE_ID, generation, kind: 'movie', name, originalName: name, groupOrder: 0, providerStreamId: id }
}

function series(id: string, name: string): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind: 'series', name, originalName: name, groupOrder: 0, seriesId: id }
}

async function movieCategory(generation = 1): Promise<number> {
  const [id] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes', order: 0 }],
    database,
  )
  return id
}

describe('getChannel depois da conversão para blocos', () => {
  it('o id antigo (linha) continua levando ao mesmo item, agora no bloco', async () => {
    const categoryId = await movieCategory()
    const [oldId] = (await database.channels.bulkAdd(
      [
        { ...movie('m1', 'Matrix'), categoryId, categoryPosition: 0 },
        { ...movie('m2', 'Duna'), categoryId, categoryPosition: 1 },
      ],
      { allKeys: true },
    )) as number[]

    while (await convertLegacyCategories(SOURCE_ID, { maxCategories: 1 }, database)) {
      // uma categoria por chamada
    }
    expect(await database.channels.get(oldId)).toBeUndefined()

    const record = await getChannel(oldId, database)
    expect(record?.name).toBe('Matrix')
    expect(record?.id).toBeLessThan(0)
  })
})

describe('cache curto de blocos', () => {
  it('não retém um bloco maior que o limite agregado de itens', async () => {
    const get = vi.fn(async () => ({ items: Array.from({ length: 2_001 }, (_, id) => ({ id })) }))
    const databaseLike = { categoryBlocks: { get } } as never

    await readBlock(databaseLike, 1, false)
    await readBlock(databaseLike, 1, false)

    expect(get).toHaveBeenCalledTimes(2)
  })

  it('descarta o bloco memorizado quando uma escrita externa sinaliza a tabela', async () => {
    const get = vi.fn(async () => ({ items: [{ id: 1 }] }))
    const databaseLike = { categoryBlocks: { get } } as never

    await readBlock(databaseLike, 1, false)
    noteBlockWrite(databaseLike, null)
    await readBlock(databaseLike, 1, false)

    expect(get).toHaveBeenCalledTimes(2)
  })

  it('pedir o mesmo item várias vezes lê o bloco uma vez; uma escrita no bloco é vista na hora', async () => {
    const categoryId = await movieCategory()
    const target = { sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, categoryId, groupOrder: 0 }
    await storeCategoryItems(target, [movie('m1', 'Matrix'), movie('m2', 'Duna')], 1000, database)
    const id = (await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database))[0].id as number

    const get = vi.spyOn(database.categoryBlocks, 'get')
    for (let i = 0; i < 4; i += 1) expect((await getChannel(id, database))?.name).toBe('Matrix')
    expect(get).toHaveBeenCalledTimes(1)

    await renewCategoryItems(target, [movie('m1', 'Matrix (remaster)'), movie('m2', 'Duna')], 2000, database)
    expect((await getChannel(id, database))?.name).toBe('Matrix (remaster)')
  })

  it('item que saiu numa renovação não volta pelo cache', async () => {
    const categoryId = await movieCategory()
    const target = { sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, categoryId, groupOrder: 0 }
    await storeCategoryItems(target, [movie('m1', 'Matrix'), movie('m2', 'Duna')], 1000, database)
    const duna = (await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database))[1].id as number
    expect((await getChannel(duna, database))?.name).toBe('Duna')

    await renewCategoryItems(target, [movie('m1', 'Matrix')], 2000, database)
    expect(await getChannel(duna, database)).toBeUndefined()
  })
})

describe('resolveFavorites com identidade repetida', () => {
  // Antes: a 2ª cópia substituía a 1ª no mapa, a 1ª nunca resolvia, e a
  // contagem do que faltava nunca zerava — a varredura lia todos os blocos.
  it('resolve todas as cópias da mesma identidade', async () => {
    const first = await movieCategory()
    const [second] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Outros', order: 1 }],
      database,
    )
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: first, groupOrder: 0 }, [movie('m1', 'Matrix')], 1, database)
    await storeCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: second, groupOrder: 1 },
      [movie('m9', 'Outro')],
      1,
      database,
    )

    const parts = () => parseStableId(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'm1' })) as StableIdParts
    const a = parts()
    const b = parts()

    const { records, unresolved } = await resolveFavorites(SOURCE_ID, 'movie', [a, b], database)
    expect(records.map((record) => record.name)).toEqual(['Matrix', 'Matrix'])
    expect(unresolved).toBe(0)
  })
})

describe('storeSeriesEpisodes com a série em bloco', () => {
  it('carimba sem regravar o bloco, e getChannel mostra o carimbo; a próxima renovação o incorpora', async () => {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', name: 'Séries', order: 0 }],
      database,
    )
    const target = { sourceId: SOURCE_ID, generation: 1, kind: 'series' as const, categoryId, groupOrder: 0 }
    await storeCategoryItems(target, [series('s1', 'Dark'), series('s2', 'Lost')], 1000, database)
    const darkId = (await listChannels(SOURCE_ID, 0, 0, 10, 'series', database))[0].id as number

    const put = vi.spyOn(database.categoryBlocks, 'put')
    await storeSeriesEpisodes({ sourceId: SOURCE_ID, generation: 1, seriesId: 's1', seriesRecordId: darkId }, [], 900, database)
    expect(put).not.toHaveBeenCalled()
    expect((await getChannel(darkId, database))?.episodesFetchedAt).toBe(900)
    put.mockRestore()

    await renewCategoryItems(target, [series('s2', 'Lost'), series('s1', 'Dark')], 2000, database)
    const renewed = await listChannels(SOURCE_ID, 0, 0, 10, 'series', database)
    expect(renewed.find((item) => item.seriesId === 's1')?.episodesFetchedAt).toBe(900)
    expect((await database.categories.get(categoryId))?.seriesEpisodesFetchedAt).toBeUndefined()
    expect((await getChannel(darkId, database))?.episodesFetchedAt).toBe(900)
  })
})

describe('blocos de outras gerações', () => {
  it('blockKeysOutsideGeneration acha só as outras gerações, pelo índice; publishGeneration apaga só elas', async () => {
    const oldCategory = await movieCategory(1)
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: oldCategory, groupOrder: 0 }, [movie('m1', 'Velho')], 1, database)
    const newCategory = await movieCategory(2)
    await storeCategoryItems(
      { sourceId: SOURCE_ID, generation: 2, kind: 'movie', categoryId: newCategory, groupOrder: 0 },
      [movie('m1', 'Novo', 2)],
      1,
      database,
    )

    expect(await blockKeysOutsideGeneration(database, SOURCE_ID, 2)).toEqual([oldCategory])

    await publishGeneration(SOURCE_ID, 2, database)
    expect(await database.categoryBlocks.toCollection().primaryKeys()).toEqual([newCategory])
    // Feature 082: os pedaços da geração publicada ficam (e os da antiga saem).
    expect((await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)).map((item) => item.name)).toEqual(['Novo'])
    expect(new Set((await categoryChunks(database).toArray()).map((row) => row.generation))).toEqual(new Set([2]))
  })
})

describe('preparo de outra lista', () => {
  it('apaga a sobra das outras fontes e mantém a da fonte ativa', async () => {
    const item = movie('m1', 'X')
    await database.sectionStaging.bulkAdd([
      { sourceId: SOURCE_ID, categoryId: 1, items: [item] },
      { sourceId: 'outra-lista', categoryId: 5, items: [item] },
    ])

    expect(await clearStagedItemsOfOtherSources(SOURCE_ID, database)).toBe(true)
    expect((await database.sectionStaging.toArray()).map((part) => part.sourceId)).toEqual([SOURCE_ID])
    expect(await clearStagedItemsOfOtherSources(SOURCE_ID, database)).toBe(false)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type BlockItem, type CatalogRecord, type CategoryKind } from './db'
import { countChannels, findSeriesRecord, getChannel, listChannels, resolveStableIds, storeCategories, storeCategoryItems } from './catalogRepository'
import { blockItemId, identityKey, itemsSignature } from './categoryBlocks'
import { convertNextBlock, repairOrphanCategories } from './blockConversion'
import { deleteCategoryItems, isOrphanCategory } from './blockChunks'
import { prepareMissingReadModels, readCategoryWindow } from './categoryWindow'
import { categoryChunks } from './chunkTables'
import { nextReadRevision, projectReadItem, READ_PROJECTION_CHUNK_SIZE } from './readProjection'
import { resolvePlaybackUrl } from './playbackUrl'
import { parseStableId, type StableIdParts } from './userStateRepository'

/**
 * Feature 082, T016/T017: o bloco antigo (com `items`, + projeção 065) e o formato 2 devolvem os mesmos registros, e a
 * conversão em segundo plano é retomável, preserva contagens, ids, carimbos e a URL resolvida (FR-006/FR-007, SC-006).
 */

const SOURCE = 's'
let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`conversao-082-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'S', providerDns: 'http://painel.fixture.test',
    providerUsername: 'usuario-fixture', providerPassword: 'senha-fixture', connectionState: 'synced', activeGeneration: 1,
    createdAt: 1, updatedAt: 1 })
})
afterEach(async () => { vi.restoreAllMocks(); await database.delete() })

const record = (kind: CategoryKind, order: number, index: number): CatalogRecord => ({
  sourceId: SOURCE, generation: 1, kind, groupOrder: order, name: `${kind} ${index}`, originalName: `${kind} ${index}`,
  group: index % 7 ? 'Grupo' : undefined, providerStreamId: kind === 'series' ? undefined : `${kind}${index}`,
  seriesId: kind === 'series' ? `serie${index}` : undefined, streamExtension: kind === 'movie' ? 'mp4' : undefined,
  episodesFetchedAt: kind === 'series' && index === 3 ? 77 : undefined,
})

/** Grava uma categoria no formato ANTIGO (como o app gravava antes da 082), com a projeção 065 se for grande. */
async function legacyCategory(kind: CategoryKind, order: number, count: number): Promise<number> {
  const [categoryId] = await storeCategories([{ sourceId: SOURCE, generation: 1, kind, order, fetchMode: 'on_demand',
    providerCategoryId: String(order), name: `C${order}` }], database)
  const records = Array.from({ length: count }, (_, index) => record(kind, order, index))
  const taken = new Set<number>()
  const items: BlockItem[] = records.map((value) => {
    const id = blockItemId(categoryId, identityKey(value), taken)
    taken.add(id)
    const { sourceId: _s, generation: _g, kind: _k, groupOrder: _o, ...fields } = value
    void _s; void _g; void _k; void _o
    return { ...fields, id }
  })
  await database.categoryBlocks.put({ categoryId, sourceId: SOURCE, generation: 1, kind, groupOrder: order, items })
  await database.categories.update(categoryId, { itemsFetchedAt: 42, itemsCount: count, itemsSignature: itemsSignature(records) })
  if (count >= 1000) {
    const revision = nextReadRevision()
    const projected = items.map((item, position) => projectReadItem(item, { sourceId: SOURCE, generation: 1, kind, categoryId, groupOrder: order, categoryPosition: position }))
    const chunks = Array.from({ length: Math.ceil(count / READ_PROJECTION_CHUNK_SIZE) }, (_, chunk) => projected.slice(chunk * READ_PROJECTION_CHUNK_SIZE, (chunk + 1) * READ_PROJECTION_CHUNK_SIZE))
    await database.catalogReadChunks.bulkAdd(chunks.map((part, chunk) => ({ id: [categoryId, revision, chunk] as [number, string, number],
      categoryId, sourceId: SOURCE, generation: 1, kind, revision, chunk, items: part })))
    await database.catalogReadManifests.put({ categoryId, sourceId: SOURCE, generation: 1, kind, revision, formatVersion: 1, count,
      chunkSize: READ_PROJECTION_CHUNK_SIZE, chunkCount: chunks.length, ready: true })
  }
  return categoryId
}

async function snapshot(movies: number, series: number) {
  const all = await listChannels(SOURCE, 0, 0, 5_000, 'movie', database)
  const window = await readCategoryWindow(SOURCE, movies, 990, 20, database)
  const favorites = ['s|movie|id:movie5', 's|movie|id:movie1100'].map((id) => parseStableId(id) as StableIdParts)
  return {
    all,
    window: window.items.map((item) => [item.id, item.name, item.categoryPosition]),
    total: window.total,
    one: await getChannel(all[1_001].id as number, database),
    favorites: [...(await resolveStableIds(SOURCE, 'movie', favorites, database)).values()].map((item) => item.id),
    series: await findSeriesRecord(SOURCE, 'serie3', database),
    counts: [await countChannels(SOURCE, 0, 'movie', database), await countChannels(SOURCE, 1, 'series', database)],
    url: await resolvePlaybackUrl(all[7].id as number, database),
    fetchedAt: (await database.categories.get(movies))?.itemsFetchedAt,
    seriesCategory: series,
  }
}

describe('conversão para o formato comprimido (feature 082, T016/T017)', () => {
  it('bloco antigo e formato 2 devolvem os mesmos registros, e a projeção 065 sai depois', async () => {
    const movies = await legacyCategory('movie', 0, 1_200)
    const series = await legacyCategory('series', 1, 30)
    const before = await snapshot(movies, series)

    while (await convertNextBlock(SOURCE, {}, database)) { /* uma categoria por chamada */ }
    expect((await database.categoryBlocks.get(movies))).toMatchObject({ format: 2, count: 1_200 })
    expect((await database.categoryBlocks.get(series))?.items).toBeUndefined()

    const after = await snapshot(movies, series)
    expect(after).toEqual(before)
    expect(after.series?.episodesFetchedAt).toBe(77)

    // A 2ª cópia (projeção 065) é apagada pela limpeza em segundo plano.
    while (await prepareMissingReadModels(SOURCE, database)) { /* uma leva por chamada */ }
    expect(await database.catalogReadManifests.count()).toBe(0)
    expect(await database.catalogReadChunks.count()).toBe(0)
    expect((await readCategoryWindow(SOURCE, movies, 990, 20, database)).items.map((item) => item.id)).toEqual(before.window.map(([id]) => id))
  })

  it('retoma depois de uma interrupção sem duplicar; a categoria antiga continua legível enquanto isso', async () => {
    const movies = await legacyCategory('movie', 0, 600)
    const before = await listChannels(SOURCE, 0, 0, 1_000, 'movie', database)
    const put = categoryChunks(database).bulkPut.bind(categoryChunks(database))
    const spy = vi.spyOn(categoryChunks(database), 'bulkPut').mockImplementationOnce(() => { throw new Error('app fechado no meio') })
    await expect(convertNextBlock(SOURCE, {}, database)).rejects.toThrow('app fechado no meio')
    spy.mockImplementation(put)

    expect((await database.categoryBlocks.get(movies))?.format).toBeUndefined()
    expect(await categoryChunks(database).count()).toBe(0)
    expect(await listChannels(SOURCE, 0, 0, 1_000, 'movie', database)).toEqual(before)

    expect(await convertNextBlock(SOURCE, {}, database)).toBe(true)
    expect(await convertNextBlock(SOURCE, {}, database)).toBe(false)
    expect(await categoryChunks(database).count()).toBe(1 + 2)
    expect(await listChannels(SOURCE, 0, 0, 1_000, 'movie', database)).toEqual(before)
  })

  it('converte primeiro a lista ativa e a maior categoria; o que já está no formato 2 é pulado', async () => {
    const small = await legacyCategory('movie', 0, 10)
    const big = await legacyCategory('movie', 1, 300)
    const [fresh] = await storeCategories([{ sourceId: SOURCE, generation: 1, kind: 'movie', order: 2, fetchMode: 'on_demand', providerCategoryId: '9', name: 'nova' }], database)
    await storeCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: 2, categoryId: fresh }, [record('movie', 2, 1)], 5, database)
    const seen: number[] = []
    while (await convertNextBlock(SOURCE, { onConverted: (_source, id) => seen.push(id) }, database)) { /* uma por vez */ }
    expect(seen).toEqual([big, small])
  })

  it('banco cheio (a TV acima da cota): a conversão que bate na cota libera a categoria sob demanda em vez de travar a fila', async () => {
    const big = await legacyCategory('movie', 0, 600)
    const small = await legacyCategory('movie', 1, 10)
    const quota = Object.assign(new Error('cheio'), { name: 'QuotaExceededError' })
    const spy = vi.spyOn(categoryChunks(database), 'bulkPut').mockImplementationOnce(() => { throw quota })
    const seen: number[] = []
    expect(await convertNextBlock(SOURCE, { onConverted: (_source, id) => seen.push(id) }, database)).toBe(true)
    spy.mockRestore()
    expect(await database.categoryBlocks.get(big)).toBeUndefined()
    expect((await database.categories.get(big))?.itemsFetchedAt).toBeUndefined()
    // A fila anda: a próxima categoria converte normalmente.
    expect(await convertNextBlock(SOURCE, { onConverted: (_source, id) => seen.push(id) }, database)).toBe(true)
    expect(await convertNextBlock(SOURCE, {}, database)).toBe(false)
    expect((await database.categoryBlocks.get(small))?.format).toBe(2)
    expect(seen).toEqual([big, small])
  })

  it('acima da cota só remoção passa: liberar deixa a categoria órfã, a entrada a busca de novo e o reparo a zera', async () => {
    const movies = await legacyCategory('movie', 0, 50)
    const quota = Object.assign(new Error('cheio'), { name: 'AbortError', inner: { name: 'QuotaExceededError' } })
    const update = vi.spyOn(database.categories, 'update').mockRejectedValueOnce(quota)
    await deleteCategoryItems(database, movies)
    update.mockRestore()
    const orphan = await database.categories.get(movies)
    expect(await database.categoryBlocks.get(movies)).toBeUndefined()
    expect(orphan?.itemsFetchedAt).toBe(42)
    expect(await isOrphanCategory(database, orphan!)).toBe(true)

    expect(await repairOrphanCategories(database)).toBe('repaired')
    const repaired = await database.categories.get(movies)
    expect([repaired?.itemsFetchedAt, repaired?.itemsCount]).toEqual([undefined, 0])
    expect(await repairOrphanCategories(database)).toBe('none')
  })

  it('banco cheio com guia em linhas: a conversão tira primeiro o guia antigo e converte; o reparo deixa o guia "não sincronizado"', async () => {
    const movies = await legacyCategory('movie', 0, 50)
    await database.sources.update(SOURCE, { epgActiveGeneration: 1, epgLastSyncAt: 9 })
    await database.epgPrograms.add({ sourceId: SOURCE, generation: 1, channelKey: 'c', start: 0, end: 1, title: 'velho' })
    const quota = Object.assign(new Error('cheio'), { name: 'QuotaExceededError' })
    const spy = vi.spyOn(categoryChunks(database), 'bulkPut').mockImplementationOnce(() => { throw quota })
    expect(await convertNextBlock(SOURCE, {}, database)).toBe(true)
    spy.mockRestore()
    expect(await database.epgPrograms.count()).toBe(0)
    expect((await database.categoryBlocks.get(movies))?.items).toBeDefined() // ainda não convertida, mas não liberada
    expect(await convertNextBlock(SOURCE, {}, database)).toBe(true)
    expect((await database.categoryBlocks.get(movies))?.format).toBe(2)
    expect(await repairOrphanCategories(database)).toBe('repaired')
    const source = await database.sources.get(SOURCE)
    expect([source?.epgActiveGeneration, source?.epgLastSyncAt]).toEqual([undefined, undefined])
  })
})


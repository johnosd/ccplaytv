import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { deleteCategoryItems, readBlockChunks } from './blockChunks'
import { BlockRevisionConflict, blockWriteTables, commitBlockWrite, prepareBlockWrite, writeCompressedBlock } from './blockWrite'
import { categoryChunks } from './chunkTables'

const movie = (categoryId: number, order: number, name: string): CatalogRecord => ({
  sourceId: 's', generation: 1, kind: 'movie', groupOrder: order, categoryId, name, originalName: name, providerStreamId: name,
})

describe('blockChunks + blockWrite (feature 082, T009)', () => {
  let database: CatalogDb
  let a: number
  let b: number
  const target = (categoryId: number, groupOrder: number) => ({ categoryId, sourceId: 's', generation: 1, kind: 'movie' as const, groupOrder })

  beforeEach(async () => {
    database = new CatalogDb(`chunks-${Math.random().toString(36).slice(2)}`)
    await database.open()
    await database.sources.add({ id: 's', type: 'provider_credentials', displayName: 'S', connectionState: 'synced', activeGeneration: 1, createdAt: 1, updatedAt: 1 })
    ;[a, b] = (await database.categories.bulkAdd([
      { sourceId: 's', generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'A', order: 0 },
      { sourceId: 's', generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'B', order: 1 },
    ], { allKeys: true })) as number[]
  })
  afterEach(async () => { await database.delete() })

  it('lê uma faixa no meio, no fim e vazia', async () => {
    await writeCompressedBlock(target(a, 0), Array.from({ length: 1_001 }, (_, index) => movie(a, 0, `A${index}`)), 10, database)
    expect((await readBlockChunks(database, a, 499, 502)).map((row) => [row.name, row.categoryPosition])).toEqual([['A499', 499], ['A500', 500], ['A501', 501]])
    expect((await readBlockChunks(database, a, 999, 5_000)).map((row) => row.name)).toEqual(['A999', 'A1000'])
    expect(await readBlockChunks(database, a, 2_000, 2_010)).toEqual([])
    expect(await readBlockChunks(database, a, 10, 10)).toEqual([])
    const header = await database.categoryBlocks.get(a)
    expect(header).toMatchObject({ format: 2, count: 1_001, chunkCount: 3 })
    expect(header?.items).toBeUndefined()
  })

  it('gravação concorrente: a revisão mudou entre as fases, a 2ª refaz a fase 1 sem misturar pedaços', async () => {
    await writeCompressedBlock(target(a, 0), Array.from({ length: 700 }, (_, index) => movie(a, 0, `velho${index}`)), 10, database)
    // Fase 1 lida antes de outra gravação terminar → a fase 2 recusa.
    const stale = await prepareBlockWrite(target(a, 0), [movie(a, 0, 'X')], database)
    await writeCompressedBlock(target(a, 0), [movie(a, 0, 'Y')], 11, database)
    if (typeof stale === 'string') throw new Error('esperava gravação preparada')
    await expect(database.transaction('rw', blockWriteTables(database), () => commitBlockWrite(stale, 12, database))).rejects.toBeInstanceOf(BlockRevisionConflict)

    // Pelo `writeCompressedBlock`: outra gravação entra entre as fases da 1ª tentativa; a 2ª tentativa vence, inteira.
    let first = true
    const room = async () => {
      if (first) {
        first = false
        await writeCompressedBlock(target(a, 0), Array.from({ length: 900 }, (_, index) => movie(a, 0, `meio${index}`)), 13, database)
      }
      return true
    }
    const result = await writeCompressedBlock(target(a, 0), Array.from({ length: 501 }, (_, index) => movie(a, 0, `novo${index}`)), 14, database, { room })
    expect(result.written).toBe(true)
    const all = await readBlockChunks(database, a)
    expect(all).toHaveLength(501)
    expect(all.every((row) => row.name.startsWith('novo'))).toBe(true)
    // Só os pedaços da gravação vencedora: índice + 2 pedaços.
    const rows = await categoryChunks(database).where('[categoryId+chunk]').between([a, -1], [a, Number.MAX_SAFE_INTEGER], true, true).toArray()
    expect(rows.map((row) => row.chunk)).toEqual([-1, 0, 1])
    expect(new Set(rows.map((row) => row.revision)).size).toBe(1)
  })

  it('renovação mantém os ids de quem continua e não regrava a lista idêntica', async () => {
    const items = Array.from({ length: 600 }, (_, index) => movie(a, 0, `F${index}`))
    await writeCompressedBlock(target(a, 0), items, 10, database)
    const before = await readBlockChunks(database, a)
    const revision = (await database.categoryBlocks.get(a))?.revision
    expect((await writeCompressedBlock(target(a, 0), items, 20, database)).written).toBe(false)
    expect((await database.categoryBlocks.get(a))?.revision).toBe(revision)
    expect((await database.categories.get(a))?.itemsFetchedAt).toBe(20)
    // Um item sai, um entra: os outros guardam o id.
    const changed = [...items.slice(1), movie(a, 0, 'novo')]
    expect((await writeCompressedBlock(target(a, 0), changed, 30, database)).written).toBe(true)
    const after = await readBlockChunks(database, a)
    expect(after.slice(0, 599).map((row) => row.id)).toEqual(before.slice(1).map((row) => row.id))
    expect(before.map((row) => row.id)).not.toContain(after[599].id)
  })

  it('deleteCategoryItems apaga tudo da categoria e nada de outra', async () => {
    await writeCompressedBlock(target(a, 0), Array.from({ length: 501 }, (_, index) => movie(a, 0, `A${index}`)), 10, database)
    await writeCompressedBlock(target(b, 1), [movie(b, 1, 'B')], 10, database)
    await deleteCategoryItems(database, a)
    expect(await database.categoryBlocks.get(a)).toBeUndefined()
    expect(await categoryChunks(database).where('[categoryId+chunk]').between([a, -1], [a, Number.MAX_SAFE_INTEGER], true, true).count()).toBe(0)
    const released = await database.categories.get(a)
    expect([released?.itemsCount, released?.itemsFetchedAt, released?.storedBytes]).toEqual([0, undefined, undefined])
    expect((await readBlockChunks(database, b)).map((row) => row.name)).toEqual(['B'])
  })
})

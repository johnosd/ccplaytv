import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { listCategories, storeCategories, type CatalogCategory } from './catalogRepository'
import { ensureCategory } from './categoryLoader'
import { makeRoomFor, touchSource } from './storageBudget'
import { catalogLedger, categoryStoredBytes } from './storageLedger'

/** Feature 082, T044 (US4): várias listas convivem; sai primeiro a lista ativada há mais tempo, nunca a ativa. */

let database: CatalogDb
const LISTS = ['a', 'b', 'c']

beforeEach(async () => {
  database = new CatalogDb(`listas-${Math.random().toString(36).slice(2)}`)
  await database.open()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const categoryId = new URL(String(input)).searchParams.get('category_id') ?? '0'
    const movies = Array.from({ length: 100 }, (_, index) => ({ stream_id: Number(categoryId) * 1000 + index,
      name: `Filme ${categoryId}-${index}`, category_id: categoryId, container_extension: 'mp4', stream_type: 'movie' }))
    return new Response(JSON.stringify(movies), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
  for (const [index, id] of LISTS.entries()) {
    await database.sources.add({ id, type: 'provider_credentials', displayName: id, providerDns: 'http://painel.fixture.test',
      providerUsername: 'usuario-fixture', providerPassword: 'senha-fixture', connectionState: 'synced', activeGeneration: 1,
      createdAt: 1, updatedAt: 1, lastActivatedAt: 10 + index, epgActiveGeneration: 1, epgStoredBytes: 50, epgLastSyncAt: 5 })
    await storeCategories([{ sourceId: id, generation: 1, kind: 'movie', order: 0, fetchMode: 'on_demand', providerCategoryId: String(index + 1), name: 'Ação' }], database)
    const [category] = await listCategories(id, 'movie', database)
    expect((await ensureCategory(id, category as CatalogCategory, { database, now: () => 1, budgetMode: 'prefetch' })).outcome).toBe('fetched')
  }
})
afterEach(async () => { vi.unstubAllGlobals(); await database.delete() })

const bytesOf = async (sourceId: string) => (await catalogLedger(database)).bySource[sourceId] ?? 0
const categoryOf = async (sourceId: string) => (await listCategories(sourceId, 'movie', database))[0] as CatalogCategory

describe('orçamento com várias listas', () => {
  it('com espaço sobrando, nada sai', async () => {
    const result = await makeRoomFor('c', 1, { database, mode: 'prefetch', config: { capBytes: 100 * 1024 * 1024 } })
    expect(result).toEqual({ fits: true, released: [] })
  })

  it('no teto sai a lista ativada há mais tempo (guia vira "não sincronizado"); a ativa nunca sai pela pré-carga', async () => {
    const total = (await catalogLedger(database)).total
    const result = await makeRoomFor('c', 1, { database, mode: 'prefetch', config: { capBytes: total - 1 } })
    expect(result.released.map((candidate) => candidate.key)).toEqual(['list:a'])
    expect(await bytesOf('a')).toBe(0)
    expect((await database.sources.get('a'))?.epgLastSyncAt).toBeUndefined()
    expect(await bytesOf('b')).toBeGreaterThan(0)

    // Mesmo pedindo muito, a pré-carga só tira listas inativas — a ativa fica inteira.
    const greedy = await makeRoomFor('c', 10 * 1024 * 1024, { database, mode: 'prefetch', config: { capBytes: total } })
    expect(greedy.fits).toBe(false)
    expect(greedy.released.every((candidate) => candidate.sourceId !== 'c')).toBe(true)
    expect(await categoryStoredBytes(database, (await categoryOf('c')).id)).toBeGreaterThan(0)
  })

  it('a ordem segue a ativação: reativar uma lista a protege da próxima liberação', async () => {
    touchSource('a', 100, database)
    await vi.waitFor(async () => expect((await database.sources.get('a'))?.lastActivatedAt).toBe(100))
    const total = (await catalogLedger(database)).total
    const result = await makeRoomFor('c', 1, { database, mode: 'prefetch', config: { capBytes: total - 1 } })
    expect(result.released.map((candidate) => candidate.key)).toEqual(['list:b'])
  })

  it('lista liberada e reativada: as categorias continuam listadas e ensureCategory obtém de novo, com os mesmos ids', async () => {
    const before = await categoryOf('a')
    const total = (await catalogLedger(database)).total
    await makeRoomFor('c', 1, { database, mode: 'prefetch', config: { capBytes: total - 1 } })
    const after = await categoryOf('a')
    expect(after.id).toBe(before.id)
    expect(after.itemsFetchedAt).toBeUndefined()
    expect((await ensureCategory('a', after, { database, now: () => 2 })).outcome).toBe('fetched')
    expect(await categoryStoredBytes(database, after.id)).toBeGreaterThan(0)
  })
})

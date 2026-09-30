import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { listChannels, storeCategories, storeCategoryItems, type CatalogCategory } from './catalogRepository'
import { ensureCategory } from './categoryLoader'

let database: CatalogDb
const SOURCE_ID = 'fonte-1'
const HOUR = 60 * 60 * 1000
const NOW = 100 * 24 * HOUR

beforeEach(async () => {
  database = new CatalogDb(`test-loader-renovacao-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Painel',
    providerDns: 'http://exemplo.test',
    providerUsername: 'usuario-teste',
    providerPassword: 'senha-teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

async function seedMovies(itemsFetchedAt: number): Promise<CatalogCategory> {
  const [id] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '10', name: 'Ação', order: 0 }],
    database,
  )
  await storeCategoryItems(
    { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: id, groupOrder: 0 },
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: 'Filme', originalName: 'Filme', groupOrder: 0, providerStreamId: '1' }],
    itemsFetchedAt,
    database,
  )
  return { id, kind: 'movie', name: 'Ação', order: 0, count: 1, fetchMode: 'on_demand', providerCategoryId: '10' }
}

const streams = (list: unknown[]) => vi.fn(() => Promise.resolve(new Response(JSON.stringify(list))))

describe('ensureCategory — renovação (feature 038)', () => {
  it('`renew` busca de novo e preserva o id de quem continua', async () => {
    const category = await seedMovies(NOW - 25 * HOUR)
    const [before] = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    vi.stubGlobal('fetch', streams([
      { stream_id: 1, name: 'Filme (renomeado)', stream_type: 'movie' },
      { stream_id: 2, name: 'Novo', stream_type: 'movie' },
    ]))

    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => NOW, renew: true })

    expect(result.outcome).toBe('fetched')
    const after = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(after.map((r) => r.name)).toEqual(['Filme (renomeado)', 'Novo'])
    expect(after[0].id).toBe(before.id)
  })

  it('sem `serveStale` nem `renew`, uma vencida ainda é buscada e esperada (comportamento antigo)', async () => {
    const category = await seedMovies(NOW - 25 * HOUR)
    const fetchSpy = streams([{ stream_id: 1, name: 'Filme', stream_type: 'movie' }])
    vi.stubGlobal('fetch', fetchSpy)
    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => NOW })
    expect(result.outcome).toBe('fetched')
    expect(fetchSpy).toHaveBeenCalled()
  })

  it('fresca não toca rede nem chama `serveStale`', async () => {
    const category = await seedMovies(NOW - HOUR)
    const fetchSpy = streams([])
    vi.stubGlobal('fetch', fetchSpy)
    const serveStale = vi.fn()
    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => NOW, serveStale })
    expect(result.outcome).toBe('fresh')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(serveStale).not.toHaveBeenCalled()
  })

  it('falta de espaço sai como `reason: storage_full`, nunca exceção', async () => {
    const category = await seedMovies(NOW - 25 * HOUR)
    vi.stubGlobal('fetch', streams([{ stream_id: 9, name: 'Outro', stream_type: 'movie' }]))
    const quota = Object.assign(new Error('cheio'), { name: 'QuotaExceededError' })
    vi.spyOn(database.channels, 'bulkAdd').mockRejectedValue(quota)
    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => NOW, renew: true })
    expect(result).toEqual({ outcome: 'stale-served', reason: 'storage_full' })
  })
})

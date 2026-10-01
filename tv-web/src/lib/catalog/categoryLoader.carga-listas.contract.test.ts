import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { storeCategories, storeCategoryItems, type CatalogCategory } from './catalogRepository'
import { ensureCategory } from './categoryLoader'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-loader-stale-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await database.delete()
})

const SOURCE_ID = 'fonte-1'
const HOUR = 60 * 60 * 1000
const NOW = 100 * 24 * HOUR

async function seedFetchedCategory(itemsFetchedAt: number, renewRequestedAt?: number): Promise<CatalogCategory> {
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
  if (renewRequestedAt !== undefined) await database.categories.update(id, { renewRequestedAt })
  // O retrato que a tela tem nas mãos: sem `itemsFetchedAt` (a lista de categorias não é relida).
  return { id, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '10' }
}

describe('Entrada numa categoria vencida — contrato da feature 038', () => {
  // FR-026 (vencida abre na hora com o que tem e renova atrás), FR-024 (renovação pendente depois de uma
  // atualização idem), US5-AC1/AC3, SC-006. Sem `serveStale`, o comportamento antigo continua (busca).
  it('serve o disco sem tocar a rede e pede a renovação em segundo plano', async () => {
    const category = await seedFetchedCategory(NOW - 25 * HOUR)
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('[]')))
    vi.stubGlobal('fetch', fetchSpy)
    const serveStale = vi.fn()

    const stale = await ensureCategory(SOURCE_ID, category, { database, now: () => NOW, serveStale })
    expect(stale.outcome).toBe('stale-served')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(serveStale).toHaveBeenCalledWith(category.id)

    // Renovação pedida por uma atualização (FR-024), ainda dentro das 24 h.
    await database.categories.update(category.id, { itemsFetchedAt: NOW - HOUR, renewRequestedAt: NOW - 10 })
    serveStale.mockClear()
    const pending = await ensureCategory(SOURCE_ID, category, { database, now: () => NOW, serveStale })
    expect(pending.outcome).toBe('stale-served')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(serveStale).toHaveBeenCalledWith(category.id)
  })
})

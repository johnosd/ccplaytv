import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { storeCategories, type CatalogCategory } from './catalogRepository'
import { ensureCategory } from './categoryLoader'

/**
 * Feature 042 (FR-011/FR-017): a falha de categoria sai como dado com o CÓDIGO
 * da tabela de erros — 429 do painel, rede e resposta incompatível —, nunca o
 * erro cru (que embute a URL com a credencial).
 */

let database: CatalogDb
const SOURCE_ID = 'fonte-1'

beforeEach(async () => {
  database = new CatalogDb(`test-loader-limite-${Math.random().toString(36).slice(2)}`)
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

async function emptyCategory(): Promise<CatalogCategory> {
  const [id] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '10', name: 'Ação', order: 0 }],
    database,
  )
  return { id, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '10' }
}

describe('ensureCategory — falhas com código (feature 042)', () => {
  it('HTTP 429 do painel: reason rate_limited e API-429, sem lançar', async () => {
    const category = await emptyCategory()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => 1 })
    expect(result).toEqual({ outcome: 'failed', reason: 'rate_limited', errorCode: 'API-429' })
  })

  it('credencial recusada: SRC-401', async () => {
    const category = await emptyCategory()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => 1 })
    expect(result.outcome).toBe('failed')
    expect(result.errorCode).toBe('SRC-401')
  })

  it('o resultado nunca carrega URL nem credencial', async () => {
    const category = await emptyCategory()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    const result = await ensureCategory(SOURCE_ID, category, { database, now: () => 1 })
    const serialized = JSON.stringify(result)
    for (const secret of ['usuario-teste', 'senha-teste', 'exemplo.test', 'http']) {
      expect(serialized).not.toContain(secret)
    }
  })
})

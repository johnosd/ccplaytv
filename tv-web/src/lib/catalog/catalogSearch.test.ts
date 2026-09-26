import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { markCategoryFetched, storeCategories, type NewCategory } from './catalogRepository'
import { loadSearchIndex } from './catalogSearch'

/**
 * T028 (feature 017, US2): regra de cobertura (D-003 do plano) fora do
 * hook React Query — `loadSearchIndex` direto contra um banco real
 * (fake-indexeddb), mesmo padrão de `catalogRepository.test.ts`.
 */

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-catalog-search-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

const SOURCE_ID = 'fonte-1'

async function seedSource(activeGeneration = 1): Promise<void> {
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte',
    connectionState: 'never_synced',
    createdAt: 1,
    updatedAt: 1,
    activeGeneration,
  })
}

function newCategory(overrides: Partial<NewCategory> = {}): NewCategory {
  return {
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    fetchMode: 'on_demand',
    order: 0,
    ...overrides,
  }
}

describe('catalogSearch — cobertura (FR-014, T028)', () => {
  it('nenhuma categoria aberta (on_demand sem itemsFetchedAt) → 0 de Y', async () => {
    await seedSource()
    await storeCategories([newCategory({ order: 0, name: 'Ação' }), newCategory({ order: 1, name: 'Comédia' })], database)

    const index = await loadSearchIndex(SOURCE_ID, 'movie', database)

    expect(index.coveredCategories).toBe(0)
    expect(index.totalCategories).toBe(2)
  })

  it('categoria eager conta como coberta mesmo sem itemsFetchedAt', async () => {
    await seedSource()
    await storeCategories([newCategory({ order: 0, name: 'Tudo', fetchMode: 'eager' })], database)

    const index = await loadSearchIndex(SOURCE_ID, 'movie', database)

    expect(index.coveredCategories).toBe(1)
    expect(index.totalCategories).toBe(1)
  })

  it('categoria com itemsFetchedAt vencido (>24h) continua coberta — a busca local nunca re-obtém, só lê o que já está no aparelho (D-002)', async () => {
    await seedSource()
    const [categoryId] = await storeCategories([newCategory({ order: 0, name: 'Ação' })], database)
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000
    await markCategoryFetched(categoryId, twentyFiveHoursAgo, 0, database)

    const index = await loadSearchIndex(SOURCE_ID, 'movie', database)

    expect(index.coveredCategories).toBe(1)
    expect(index.totalCategories).toBe(1)
  })
})

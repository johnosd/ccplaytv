import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { markCategoryFetched, storeCategories, type NewCategory } from './catalogRepository'
import { buildSearchIndex, loadSearchIndex, searchIndex, searchWithinItems } from './catalogSearch'

describe('searchWithinItems — nome normalizado reaproveitado entre teclas (feature 039, T018)', () => {
  it('a mesma lista, termo após termo, dá o resultado de sempre; item renomeado é renormalizado', () => {
    const items = [{ name: 'Matrix' }, { name: 'Animatrix' }, { name: 'Duna' }, { name: 'matrix reloaded' }]
    const nameOf = (item: { name: string }) => item.name

    expect(searchWithinItems(items, 'mat', nameOf).map(nameOf)).toEqual(['Matrix', 'matrix reloaded', 'Animatrix'])
    expect(searchWithinItems(items, 'matr', nameOf).map(nameOf)).toEqual(['Matrix', 'matrix reloaded', 'Animatrix'])
    expect(searchWithinItems(items, 'dun', nameOf).map(nameOf)).toEqual(['Duna'])

    items[2].name = 'Ação'
    expect(searchWithinItems(items, 'dun', nameOf)).toEqual([])
    expect(searchWithinItems(items, 'aca', nameOf).map(nameOf)).toEqual(['Ação'])
  })

  it('aceita itens que não são objetos (sem cache)', () => {
    expect(searchWithinItems(['Beta', 'Alfa beta'], 'bet', (item) => item)).toEqual(['Beta', 'Alfa beta'])
  })
})

describe('buildSearchIndex — nome normalizado sob demanda (feature 039, T018)', () => {
  const record = (name: string): CatalogRecord => ({
    sourceId: 'f',
    generation: 1,
    kind: 'movie',
    name,
    originalName: name,
    groupOrder: 0,
  })

  it('montar o índice não lê o nome; ler normalizedName dá o mesmo valor de antes, uma vez só', () => {
    const records = [record('  Ação   Total '), record('Élan')]
    const reads = vi.fn()
    const spied = records.map((item) => {
      const { name, ...rest } = item
      return Object.defineProperty({ ...rest } as CatalogRecord, 'name', {
        get: () => {
          reads()
          return name
        },
        enumerable: true,
      })
    })

    const index = buildSearchIndex(spied, { coveredCategories: 1, totalCategories: 1 })
    expect(reads).not.toHaveBeenCalled()

    expect(index.entries.map((entry) => entry.normalizedName)).toEqual(['acao total', 'elan'])
    expect(index.entries[0].normalizedName).toBe('acao total')
    expect(reads).toHaveBeenCalledTimes(2)
    expect(index.entries[0].record).toBe(spied[0])
    expect(searchIndex(index, 'total').map((item) => item.name)).toEqual(['  Ação   Total '])
  })
})

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

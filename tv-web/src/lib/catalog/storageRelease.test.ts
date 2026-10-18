import { describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { releaseCandidates } from './storageRelease'
import { planStorageRelease, subscribeCatalogReleases } from './storageBudget'

describe('storageRelease', () => {
  it('não oferece categorias eager/stored e ordena categorias refazíveis', async () => {
    const database = new CatalogDb(`release-${Math.random()}`); await database.open()
    await database.categories.bulkAdd([
      { sourceId: 'active', generation: 1, kind: 'movie', fetchMode: 'on_demand', order: 0, itemsCount: 1, storedBytes: 100, lastUsedAt: 20 },
      { sourceId: 'active', generation: 1, kind: 'movie', fetchMode: 'eager', order: 1, itemsCount: 1, storedBytes: 100 },
      { sourceId: 'active', generation: 1, kind: 'movie', fetchMode: 'stored', order: 2, itemsCount: 1, storedBytes: 100 },
    ])
    const candidates = await releaseCandidates(database, 'active')
    expect(candidates.map((candidate) => candidate.categoryId)).toEqual([1])
    expect(planStorageRelease({ capBytes: 50, ledgerBytes: 100 }, 10, candidates, 'entry')).toHaveLength(1)
    await database.delete()
  })
  it('expõe uma assinatura para invalidação agrupada', () => {
    const seen: number[][] = []
    const off = subscribeCatalogReleases((_source, ids) => seen.push(ids))
    off()
    expect(seen).toEqual([])
  })
})

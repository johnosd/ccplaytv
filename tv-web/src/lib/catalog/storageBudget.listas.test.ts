import { describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { touchSource } from './storageBudget'
import { releaseCandidates } from './storageRelease'

describe('orçamento com várias listas', () => {
  it('registra ativação e mantém a lista ativa fora dos candidatos de pré-carga', async () => {
    const database = new CatalogDb(`listas-${Math.random()}`); await database.open()
    await database.sources.bulkAdd([
      { id: 'a', type: 'provider_credentials', displayName: 'A', connectionState: 'synced', createdAt: 1, updatedAt: 1, lastActivatedAt: 10 },
      { id: 'b', type: 'provider_credentials', displayName: 'B', connectionState: 'synced', createdAt: 1, updatedAt: 1, lastActivatedAt: 20 },
    ])
    touchSource('b', 30, database)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await database.sources.get('b'))?.lastActivatedAt).toBe(30)
    expect((await releaseCandidates(database, 'b')).every((candidate) => candidate.sourceId !== 'b')).toBe(true)
    await database.delete()
  })
})

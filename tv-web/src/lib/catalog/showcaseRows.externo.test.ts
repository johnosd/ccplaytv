import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { readExternalRow, writeExternalRow } from './showcaseRows'

/** Feature 086 (FR-013/FR-015): a montagem lê o que está guardado e nunca dispara nem espera o serviço externo. */
let database: CatalogDb
const SOURCE = 'fonte-ext'

beforeEach(async () => {
  database = new CatalogDb(`ext-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 2, createdAt: 1, updatedAt: 1 })
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await database.delete()
})

const row = (over: Partial<Parameters<typeof writeExternalRow>[0]> = {}) => ({
  id: '', sourceId: SOURCE, generation: 2, kind: 'movie' as const, row: 'top10' as const,
  periodKey: '2026-W42', items: [], computedAt: 1, ...over,
})

describe('fileiras de serviço externo guardadas (086)', () => {
  it('sem resultado guardado devolve undefined e não toca a rede', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('período vencido continua valendo: a fileira mostra o guardado até o novo chegar', async () => {
    await writeExternalRow(row({ periodKey: '2026-W40' }), database)
    const stored = await readExternalRow(SOURCE, 'movie', 'top10', database)
    expect(stored?.periodKey).toBe('2026-W40')
  })

  it('resultado de outra geração do catálogo não é usado', async () => {
    await writeExternalRow(row({ generation: 1 }), database)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeUndefined()
  })
})

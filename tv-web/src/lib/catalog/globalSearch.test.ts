import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { listAllOfKind, storeCategories } from './catalogRepository'
import { writeCompressedBlock } from './blockWrite'
import { buildSearchIndex, compactSearchRecord, isCovered } from './catalogSearch'
import { listVisibleCategories } from './categoryAccess'
import { loadGlobalSearchIndex, searchGlobal, type GlobalSearchIndex } from './globalSearch'

const SOURCE = 'fonte-084-global'
let database: CatalogDb

const NAMES = ['Matrix', 'Mad Max', 'O Máximo', 'Mamãe e Eu', 'Agente 007', 'The Matrix Reloaded', 'The Office', 'Ação Total', 'Acao Direta', 'Thé']

beforeEach(async () => {
  database = new CatalogDb(`test-084-global-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'F', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
  const kinds = ['channel', 'movie', 'series'] as const
  for (const [order, kind] of kinds.entries()) {
    const [categoryId] = await storeCategories([
      { sourceId: SOURCE, generation: 1, kind, fetchMode: 'on_demand', providerCategoryId: String(order), name: `Cat ${kind}`, order: 0 },
    ], database)
    const records: CatalogRecord[] = Array.from({ length: 700 }, (_, index) => ({ sourceId: SOURCE, generation: 1, kind, groupOrder: 0,
      categoryId, name: `${NAMES[index % NAMES.length]} ${index}`, originalName: `${index}`, providerStreamId: `${kind}-${index}` }))
    await writeCompressedBlock({ sourceId: SOURCE, generation: 1, kind, categoryId, groupOrder: 0 }, records, 10, database)
  }
})

afterEach(async () => {
  await database.delete()
})

// O índice de hoje: registros de `listAllOfKind` compactados.
async function reference(): Promise<GlobalSearchIndex> {
  const built = {} as Record<'channel' | 'movie' | 'series', ReturnType<typeof buildSearchIndex>>
  for (const kind of ['channel', 'movie', 'series'] as const) {
    const [records, categories] = await Promise.all([listAllOfKind(SOURCE, kind, database), listVisibleCategories(SOURCE, kind, database)])
    built[kind] = buildSearchIndex(records.map(compactSearchRecord), { coveredCategories: categories.filter(isCovered).length, totalCategories: categories.length })
  }
  return built
}

describe('loadGlobalSearchIndex em fatias (feature 084)', () => {
  it.each(['ma', 'acao', 'the', '007', 'x'])('searchGlobal("%s") dá os mesmos resultados do índice de referência (SC-004)', async (term) => {
    const sliced = await loadGlobalSearchIndex(SOURCE, database, { yieldToMain: async () => {} })
    expect(searchGlobal(sliced, term)).toEqual(searchGlobal(await reference(), term))
  })

  it('o sinal abortado rejeita com AbortError', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(loadGlobalSearchIndex(SOURCE, database, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

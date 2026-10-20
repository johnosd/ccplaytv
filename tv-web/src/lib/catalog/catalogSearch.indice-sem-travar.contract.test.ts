/**
 * Testes de CONTRATO da feature 084 (índice de busca sem travar a tela) — travados em
 * `sdd/specs/084-indice-busca-sem-travar/contract-tests.lock`. O sdd-execute só pode fazê-los passar, nunca editá-los.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { markCategoryFetched, storeBatch, storeCategories } from './catalogRepository'
import { writeCompressedBlock } from './blockWrite'
import { setCategoryPreference, listVisibleCategories } from './categoryAccess'
import { listAllOfKind } from './catalogRepository'
import { compactSearchRecord, isCovered, loadSearchIndex } from './catalogSearch'

const SOURCE = 'fonte-084'
let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-084-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'F', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
  const [blockA, rowsB, hiddenC, blockD] = await storeCategories([
    { sourceId: SOURCE, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '1', name: 'Ação', order: 0 },
    { sourceId: SOURCE, generation: 1, kind: 'movie', fetchMode: 'eager', providerCategoryId: '2', name: 'Drama', order: 1 },
    { sourceId: SOURCE, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '3', name: 'Terror', order: 2 },
    { sourceId: SOURCE, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '4', name: 'Ópera', order: 3 },
  ], database)
  const movie = (categoryId: number, order: number, name: string): CatalogRecord => ({ sourceId: SOURCE, generation: 1,
    kind: 'movie', groupOrder: order, categoryId, name, originalName: name, providerStreamId: `${categoryId}-${name}` })
  // Formato da 082 (pedaços comprimidos), formato antigo em linhas, categoria escondida e outra em pedaços.
  await writeCompressedBlock({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: blockA, groupOrder: 0 },
    Array.from({ length: 1_203 }, (_, index) => movie(blockA, 0, `Ação ${index} Á`)), 10, database)
  await storeBatch(Array.from({ length: 40 }, (_, index) => ({ ...movie(rowsB, 1, `Drama ${index}`), categoryPosition: index })), database)
  await markCategoryFetched(rowsB, 10, 40, database)
  await writeCompressedBlock({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: hiddenC, groupOrder: 2 },
    Array.from({ length: 30 }, (_, index) => movie(hiddenC, 2, `Terror ${index}`)), 10, database)
  await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', providerCategoryId: '3', name: 'Terror' }, { hidden: true }, database)
  await writeCompressedBlock({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: blockD, groupOrder: 3 },
    Array.from({ length: 700 }, (_, index) => movie(blockD, 3, `Ópera ${index}`)), 10, database)
})

afterEach(async () => {
  await database.delete()
})

// Referência: o índice de hoje (registros de `listAllOfKind` compactados, mesma ordem, mesma cobertura).
async function reference() {
  const [records, categories] = await Promise.all([listAllOfKind(SOURCE, 'movie', database), listVisibleCategories(SOURCE, 'movie', database)])
  return { records: records.map(compactSearchRecord), covered: categories.filter(isCovered).length, total: categories.length }
}

// FR-001 + FR-002 (US1/AC1-AC2): cede a vez entre fatias e o índice sai idêntico ao de hoje (sem a categoria escondida).
it('FR-001/FR-002: monta o índice em fatias, cedendo a vez, com o mesmo conteúdo, ordem e cobertura de hoje', async () => {
  let yields = 0
  const index = await loadSearchIndex(SOURCE, 'movie', database, { yieldToMain: async () => { yields += 1 }, normalize: true })
  const expected = await reference()

  expect(yields).toBeGreaterThanOrEqual(3) // ao menos uma vez por categoria com conteúdo
  expect(index.entries.map((entry) => entry.record)).toEqual(expected.records)
  expect(index.entries.some((entry) => entry.record.name.startsWith('Terror'))).toBe(false)
  expect({ covered: index.coveredCategories, total: index.totalCategories }).toEqual({ covered: expected.covered, total: expected.total })
  expect(index.entries[0].normalizedName).toBe('acao 0 a')
})

// FR-008 (US1/AC4): sair da tela no meio da montagem para tudo — rejeita com AbortError e não lê mais nada.
it('FR-008: cancelada no meio, rejeita com AbortError e para de ceder (nenhum trabalho depois do cancelamento)', async () => {
  const controller = new AbortController()
  let yields = 0
  const loading = loadSearchIndex(SOURCE, 'movie', database, {
    signal: controller.signal,
    yieldToMain: async () => {
      yields += 1
      if (yields === 1) controller.abort()
    },
  })

  await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
  expect(yields).toBe(1)
})

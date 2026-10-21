/**
 * Feature 086, FR-003 (task T077): a carga por seção grava os candidatos das fileiras **uma vez**, no fim, e não uma
 * vez por categoria.
 *
 * Por que este teste existe: a primeira implementação gravava por categoria, dentro do laço da carga — o que a spec
 * não pedia ("ao fim de cada carga por seção... junto com a gravação já em andamento"). Na TV isso levou a carga de
 * séries de 3,2 s para 26,6 s (R-014). Nada no resultado da carga denuncia a diferença: só a contagem de escritas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import * as repository from './catalogRepository'
import { loadSection } from './sectionLoader'
import { readCandidates } from './showcaseCandidates'

const SOURCE_ID = 'fonte-086-secao'
const CATEGORIES = 8
const PER_CATEGORY = 25

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-086-secao-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID, type: 'provider_credentials', displayName: 'Painel', providerDns: 'http://exemplo.test',
    providerUsername: 'usuario-teste', providerPassword: 'senha-teste', connectionState: 'synced', activeGeneration: 1,
    createdAt: 1, updatedAt: 1,
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function seed(): Promise<number[]> {
  return repository.storeCategories(Array.from({ length: CATEGORIES }, (_, i) => ({
    sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, fetchMode: 'on_demand' as const,
    providerCategoryId: String(i), name: `Grupo ${i}`, order: i,
  })), database)
}

describe('candidatos das fileiras na carga por seção (086)', () => {
  it('grava os candidatos de toda a seção numa escrita só, e não uma por categoria', async () => {
    const ids = await seed()
    const section = Array.from({ length: CATEGORIES * PER_CATEGORY }, (_, k) => ({
      stream_id: k + 1, name: `Filme ${k + 1}`, category_id: String(k % CATEGORIES),
      rating: String(6 + (k % 40) / 10), releaseDate: `20${10 + (k % 15)}-01-01`, added: String(1_700_000_000 + k),
    }))
    const put = vi.spyOn(database.showcaseCandidates, 'put')
    const bulkPut = vi.spyOn(database.showcaseCandidates, 'bulkPut')

    const result = await loadSection(SOURCE_ID, 'movie', ids, {
      database,
      fetchImpl: async () => new Response(JSON.stringify(section)),
    })

    expect(result.outcome).toBe('done')
    // Uma escrita em lote para a seção inteira; nenhuma escrita por categoria.
    expect(bulkPut).toHaveBeenCalledTimes(1)
    expect(put).not.toHaveBeenCalled()

    // E o conteúdo está lá: uma linha de candidatos por categoria, na ordem da fonte.
    const candidates = await readCandidates(SOURCE_ID, 'movie', database)
    expect(candidates).toHaveLength(CATEGORIES)
    expect(candidates.map((row) => row.order)).toEqual(ids.map((_, index) => index))
    expect(candidates.every((row) => row.itemsCount === PER_CATEGORY)).toBe(true)
    expect(candidates.every((row) => row.recent.length > 0)).toBe(true)
  })
})

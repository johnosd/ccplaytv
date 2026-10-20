// Contrato da feature 085 (US2) — travado pelo sdd-plan; o sdd-execute só pode fazê-lo passar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import * as repository from './catalogRepository'
import { loadSection } from './sectionLoader'

vi.mock('./catalogRepository', async (importOriginal) => {
  const original = await importOriginal<typeof import('./catalogRepository')>()
  return { ...original, clearStagedItems: vi.fn(original.clearStagedItems) }
})

const SOURCE_ID = 'fonte-085'
let database: CatalogDb

beforeEach(async () => {
  vi.mocked(repository.clearStagedItems).mockClear()
  database = new CatalogDb(`test-085-secao-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID, type: 'provider_credentials', displayName: 'Painel', providerDns: 'http://exemplo.test',
    providerUsername: 'usuario-teste', providerPassword: 'senha-teste', connectionState: 'synced', activeGeneration: 1,
    createdAt: 1, updatedAt: 1,
  })
})

afterEach(async () => {
  await database.delete()
})

function seed(count: number): Promise<number[]> {
  return repository.storeCategories(Array.from({ length: count }, (_, i) => ({
    sourceId: SOURCE_ID, generation: 1, kind: 'channel' as const, fetchMode: 'on_demand' as const,
    providerCategoryId: String(i), name: `Grupo ${i}`, order: i,
  })), database)
}

/** Resposta em fluxo, em pedaços de 64 KiB (como a rede entrega). */
function streamed(body: unknown): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 65_536) controller.enqueue(bytes.slice(i, i + 65_536))
      controller.close()
    },
  }))
}

describe('preparo enxuto na carga por seção (085)', () => {
  // FR-007 + FR-009 (US2/AC1): a seção de filmes da lista real (43 510 itens, 35 categorias) cabe abaixo do limite.
  it('uma seção do tamanho da lista real é gravada inteira sem passar pela área de preparo', async () => {
    const ids = await seed(35)
    const section = Array.from({ length: 43_510 }, (_, k) => ({ stream_id: k + 1, name: `Canal ${k + 1}`, category_id: String(k % 35) }))
    const bulkAdd = vi.spyOn(database.sectionStaging, 'bulkAdd')

    const result = await loadSection(SOURCE_ID, 'channel', ids, { database, fetchImpl: async () => streamed(section) })

    expect(result.outcome).toBe('done')
    expect(result.written).toEqual(ids)
    expect(bulkAdd).not.toHaveBeenCalled()
    const counts = await Promise.all(ids.map(async (id) => (await database.categories.get(id))?.itemsCount ?? 0))
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(43_510)
  })

  // FR-008 (US2/AC2): acima do limite o preparo é usado e limpo de uma vez, nunca categoria por categoria.
  it('acima do limite, o preparo é limpo uma vez no fim, sem limpeza por categoria, e nada sobra', async () => {
    const ids = await seed(3)
    const section = Array.from({ length: 30 }, (_, k) => ({ stream_id: k + 1, name: `Canal ${k + 1}`, category_id: String(k % 3) }))
    const bulkAdd = vi.spyOn(database.sectionStaging, 'bulkAdd')

    const result = await loadSection(SOURCE_ID, 'channel', ids, { database, fetchImpl: async () => streamed(section), stageFlushItems: 4 })

    expect(result).toMatchObject({ outcome: 'done', written: ids })
    expect(bulkAdd).toHaveBeenCalled()
    const perCategory = vi.mocked(repository.clearStagedItems).mock.calls.filter(([, categoryId]) => categoryId !== undefined)
    expect(perCategory).toEqual([])
    expect(await database.sectionStaging.count()).toBe(0)
  })
})

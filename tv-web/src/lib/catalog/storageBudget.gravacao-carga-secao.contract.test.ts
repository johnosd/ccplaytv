// Contrato da feature 085 (US1) — travado pelo sdd-plan; o sdd-execute só pode fazê-lo passar.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { stageSectionItems, storeCategories } from './catalogRepository'
import { makeRoomFor } from './storageBudget'
import { METADATA_BYTES } from './storageLedger'

const ACTIVE = 'lista-ativa'
const OTHER = 'outra-lista'
let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-085-orcamento-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: ACTIVE, type: 'provider_credentials', displayName: 'Painel', providerDns: 'http://exemplo.test',
    providerUsername: 'usuario-teste', providerPassword: 'senha-teste', connectionState: 'synced', activeGeneration: 1,
    createdAt: 1, updatedAt: 1,
  })
})

afterEach(async () => {
  await database.delete()
})

function items(categoryId: number, from: number, count: number): CatalogRecord[] {
  return Array.from({ length: count }, (_, k) => ({
    id: from + k, sourceId: ACTIVE, generation: 1, kind: 'movie', categoryId, groupOrder: 0,
    name: `Filme ${from + k} com um nome de tamanho realista`, logo: `http://img.exemplo/p/${from + k}.jpg`,
    streamId: String(from + k), rating: '7.1', added: '1700000000', ext: 'mp4',
  }) as unknown as CatalogRecord)
}

async function averageMs(calls: number, run: () => Promise<unknown>): Promise<number> {
  const start = performance.now()
  for (let i = 0; i < calls; i += 1) await run()
  return (performance.now() - start) / calls
}

describe('orçamento barato na carga por seção (085)', () => {
  // FR-001 + FR-002 + FR-005 (US1/AC4)
  it('o custo não cresce com os itens preparados, e só o preparo de outra lista é liberado', async () => {
    const ids = await storeCategories(Array.from({ length: 35 }, (_, i) => ({
      sourceId: ACTIVE, generation: 1, kind: 'movie' as const, fetchMode: 'on_demand' as const,
      providerCategoryId: String(i), name: `Grupo ${i}`, order: i,
    })), database)
    await database.categories.update(ids[0], { storedBytes: 1000 })
    const roomy = () => makeRoomFor(ACTIVE, 100, { database, mode: 'prefetch', config: { capBytes: 1_000_000_000 } })

    const empty = await averageMs(5, roomy)
    // ~43 mil itens da lista ativa no preparo, como na carga da seção de filmes da lista real.
    const parts = ids.flatMap((categoryId, c) => [0, 1].map((p) => ({ sourceId: ACTIVE, categoryId, items: items(categoryId, (p * 35 + c) * 1000, 620) })))
    await stageSectionItems(parts, database)
    const staged = await averageMs(5, roomy)
    expect(staged).toBeLessThan(empty * 3 + 10)

    await stageSectionItems([
      { sourceId: OTHER, categoryId: 9001, items: items(9001, 900_000, 3) },
      { sourceId: OTHER, categoryId: 9002, items: items(9002, 900_100, 3) },
    ], database)
    const result = await makeRoomFor(ACTIVE, 100, { database, mode: 'prefetch', config: { capBytes: 1000 } })
    expect(result.fits).toBe(true)
    expect(result.released.map((candidate) => [candidate.scope, candidate.bytes])).toEqual([['temporary', 2 * METADATA_BYTES]])
    expect(await database.sectionStaging.where('[sourceId+categoryId]').between([OTHER, -Infinity], [OTHER, Infinity]).count()).toBe(0)
    expect(await database.sectionStaging.where('[sourceId+categoryId]').between([ACTIVE, -Infinity], [ACTIVE, Infinity]).count()).toBe(parts.length)
  })
})

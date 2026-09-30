import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import {
  applyStructureRefresh,
  collectStaleGenerations,
  listCategories,
  listChannels,
  storeCategories,
  storeCategoryItems,
} from './catalogRepository'

let database: CatalogDb
const SOURCE_ID = 'fonte-1'

beforeEach(async () => {
  database = new CatalogDb(`test-atualizacao-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Painel',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
})

afterEach(async () => {
  await database.delete()
})

function item(kind: CatalogRecord['kind'], groupOrder: number, extra: Partial<CatalogRecord>): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind, name: 'x', originalName: 'x', groupOrder, ...extra }
}

async function seed() {
  const [movies, series] = await storeCategories(
    [
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '10', name: 'Ação', order: 0 },
      { sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', providerCategoryId: '20', name: 'Novelas', order: 0 },
    ],
    database,
  )
  await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: movies, groupOrder: 0 }, [item('movie', 0, { providerStreamId: '1' })], 100, database)
  await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'series', categoryId: series, groupOrder: 0 }, [item('series', 0, { seriesId: 's1' })], 100, database)
  await database.channels.add(item('episode', 0, { seriesId: 's1', providerStreamId: '900' }))
  return { movies, series }
}

describe('applyStructureRefresh (feature 038, FR-024/FR-028)', () => {
  it('mantida conserva id e itens e ganha renovação pedida; removida sai com itens e episódios; nova entra fria com `order` livre', async () => {
    const { movies, series } = await seed()

    const result = await applyStructureRefresh(
      SOURCE_ID,
      1,
      ['movie', 'series'],
      [
        { kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '10', name: 'Ação e Aventura', position: 1 },
        { kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '11', name: 'Lançamentos', position: 0 },
      ],
      500,
      database,
    )
    expect(result).toEqual({ kept: 1, added: 1, removed: 1 })

    const kept = await database.categories.get(movies)
    expect(kept).toMatchObject({ name: 'Ação e Aventura', position: 1, order: 0, itemsFetchedAt: 100, renewRequestedAt: 500 })
    expect(await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)).toHaveLength(1)

    expect(await database.categories.get(series)).toBeUndefined()
    expect(await database.channels.where('[sourceId+generation+seriesId]').equals([SOURCE_ID, 1, 's1']).count()).toBe(0)

    const listed = await listCategories(SOURCE_ID, 'movie', database)
    expect(listed.map((c) => c.name)).toEqual(['Lançamentos', 'Ação e Aventura'])
    const added = listed[0]
    expect(added.itemsFetchedAt).toBeUndefined()
    expect(added.order).toBe(1) // próximo `order` livre da seção, nunca colide com os itens de "Ação"
  })

  it('seção fora de `kinds` (painel não serviu) fica intacta', async () => {
    const { series } = await seed()
    await applyStructureRefresh(SOURCE_ID, 1, ['movie'], [], 500, database)
    expect(await database.categories.get(series)).toBeDefined()
  })
})

describe('collectStaleGenerations (feature 038, D-008)', () => {
  it('apaga em partes só gerações sem uso; nunca a ativa, a apontada por `storedFrom` nem a de importação em andamento', async () => {
    await database.channels.bulkAdd([
      ...Array.from({ length: 5 }, () => item('movie', 0, { generation: 0 })), // velha
      item('movie', 0, { generation: 1 }), // ativa
      item('movie', 0, { generation: 2 }), // importação em andamento
    ])
    await database.storedEntries.bulkAdd([
      { sourceId: SOURCE_ID, generation: 3, categoryId: 9, chunk: 0, records: [] }, // apontada
      { sourceId: SOURCE_ID, generation: 4, categoryId: 9, chunk: 0, records: [] }, // sem uso
    ])
    await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'channel', fetchMode: 'stored', name: 'A', order: 0 }],
      database,
    ).then(([id]) => database.categories.update(id, { storedFrom: { generation: 3, categoryId: 9 } }))
    await database.importRuns.add({
      id: 'run-x',
      sourceId: SOURCE_ID,
      generation: 2,
      status: 'running',
      step: 'parsing',
      entriesRead: 0,
      channelsStored: 0,
      discardedByType: 0,
      invalidCount: 0,
      truncatedByStorage: false,
      startedAt: 1,
    })

    expect(await collectStaleGenerations(SOURCE_ID, { batchSize: 2 }, database)).toBe(true)
    while (await collectStaleGenerations(SOURCE_ID, { batchSize: 2 }, database)) {
      // parte por parte
    }

    const generations = (await database.channels.toArray()).map((r) => r.generation).sort()
    expect(generations).toEqual([1, 2])
    expect((await database.storedEntries.toArray()).map((e) => e.generation)).toEqual([3])
  })
})

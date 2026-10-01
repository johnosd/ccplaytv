import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import {
  applyStructureRefresh,
  countChannels,
  getChannel,
  listAllOfKind,
  listChannels,
  listEpisodes,
  renewCategoryItems,
  resolveFavorites,
  storeCategories,
  storeCategoryItems,
  storeSeriesEpisodes,
} from './catalogRepository'
import { categoryIdOfBlockItem, convertLegacyCategories } from './categoryBlocks'
import type { StableIdParts } from './userStateRepository'

let database: CatalogDb
const SOURCE_ID = 'fonte-1'

beforeEach(async () => {
  database = new CatalogDb(`test-blocos-${Math.random().toString(36).slice(2)}`)
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
  const name = extra.name ?? extra.providerStreamId ?? extra.seriesId ?? 'x'
  return { sourceId: SOURCE_ID, generation: 1, kind, name, originalName: name, groupOrder, ...extra }
}

async function category(kind: CatalogRecord['kind'] & ('channel' | 'movie' | 'series'), order: number, providerCategoryId: string) {
  const [id] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind, fetchMode: 'on_demand', providerCategoryId, name: `Cat ${providerCategoryId}`, order }],
    database,
  )
  return { id, target: { sourceId: SOURCE_ID, generation: 1, kind, categoryId: id, groupOrder: order } }
}

const byId = (value: string): StableIdParts => ({ sourceId: SOURCE_ID, kind: 'movie', identifier: { type: 'id', value } })

describe('Catálogo em blocos — contrato da feature 039', () => {
  // FR-001/FR-002/FR-003, US1: uma categoria é UM bloco (nenhuma linha por item); o id de cada item é
  // estável (codifica categoria + identidade), sobrevive a reordenação e some quando o item sai.
  it('grava a categoria como um bloco, com id estável por identidade e sem linha por item', async () => {
    const { id: categoryId, target } = await category('movie', 0, '10')
    await storeCategoryItems(target, ['a', 'b', 'c'].map((p) => item('movie', 0, { providerStreamId: p })), 100, database)

    expect(await database.channels.count()).toBe(0)
    const before = await listChannels(SOURCE_ID, 0, 0, 100, 'movie', database)
    expect(before.map((r) => r.providerStreamId)).toEqual(['a', 'b', 'c'])
    for (const record of before) expect(categoryIdOfBlockItem(record.id as number)).toBe(categoryId)
    expect(await countChannels(SOURCE_ID, 0, 'movie', database)).toBe(3)

    const idOf = (records: CatalogRecord[], p: string) => records.find((r) => r.providerStreamId === p)?.id
    await renewCategoryItems(target, ['c', 'a', 'd'].map((p) => item('movie', 0, { providerStreamId: p })), 200, database)
    const after = await listChannels(SOURCE_ID, 0, 0, 100, 'movie', database)
    expect(after.map((r) => r.providerStreamId)).toEqual(['c', 'a', 'd'])
    expect(idOf(after, 'a')).toBe(idOf(before, 'a'))
    expect(idOf(after, 'c')).toBe(idOf(before, 'c'))
    expect(await getChannel(idOf(before, 'b') as number, database)).toBeUndefined()
    expect((await getChannel(idOf(after, 'd') as number, database))?.providerStreamId).toBe('d')

    const same = await renewCategoryItems(target, ['c', 'a', 'd'].map((p) => item('movie', 0, { providerStreamId: p })), 300, database)
    expect(same.written).toBe(false)
  })

  // FR-004 + edge "detalhe aberto de item renovado": episódios continuam linhas ligadas à série; a marca de
  // episódios obtidos fica na série do bloco e sobrevive à renovação da categoria.
  it('episódios continuam por série e a marca de obtenção da série sobrevive à renovação do bloco', async () => {
    const { id: categoryId, target } = await category('series', 0, '20')
    await storeCategoryItems(target, [item('series', 0, { seriesId: 's1', name: 'Série' })], 100, database)
    const [series] = await listChannels(SOURCE_ID, 0, 0, 10, 'series', database)
    expect(categoryIdOfBlockItem(series.id as number)).toBe(categoryId)
    expect(await database.channels.filter((r) => r.kind === 'series').count()).toBe(0)

    await storeSeriesEpisodes(
      { sourceId: SOURCE_ID, generation: 1, seriesId: 's1', seriesRecordId: series.id as number },
      [item('episode', 0, { seriesId: 's1', providerStreamId: 'e1', seasonNumber: 1, episodeNumber: 1 })],
      150,
      database,
    )
    expect((await listEpisodes(SOURCE_ID, 's1', database)).map((e) => e.providerStreamId)).toEqual(['e1'])
    expect((await getChannel(series.id as number, database))?.episodesFetchedAt).toBe(150)

    await renewCategoryItems(target, [item('series', 0, { seriesId: 's1', name: 'Série (nova capa)' })], 200, database)
    const renewed = await getChannel(series.id as number, database)
    expect(renewed?.name).toBe('Série (nova capa)')
    expect(renewed?.episodesFetchedAt).toBe(150)
  })

  // US4, FR-008 a FR-011: linhas do formato antigo continuam legíveis; a conversão vira bloco com os
  // mesmos itens e ordem, apaga as linhas da categoria, é idempotente, não toca episódios, e favoritos
  // (por identidade estável) seguem resolvendo.
  it('converte o formato antigo em partes, sem perder itens nem favoritos, e sem refazer', async () => {
    const { id: categoryId } = await category('movie', 0, '10')
    await database.categories.update(categoryId, { itemsFetchedAt: 100, itemsCount: 2 })
    await database.channels.bulkAdd([
      item('movie', 0, { providerStreamId: 'm1', name: 'Um', categoryId, categoryPosition: 0 }),
      item('movie', 0, { providerStreamId: 'm2', name: 'Dois', categoryId, categoryPosition: 1 }),
      item('episode', 5, { seriesId: 'sx', providerStreamId: 'ep', seasonNumber: 1, episodeNumber: 1 }),
    ])

    const legacy = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(legacy.map((r) => r.name)).toEqual(['Um', 'Dois'])
    expect((await resolveFavorites(SOURCE_ID, 'movie', [byId('m2')], database)).records.map((r) => r.name)).toEqual(['Dois'])

    for (let guard = 0; guard < 10 && (await convertLegacyCategories(SOURCE_ID, { maxCategories: 1 }, database)); guard += 1) {
      // parte por parte
    }

    const converted = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(converted.map((r) => r.name)).toEqual(['Um', 'Dois'])
    for (const record of converted) expect(categoryIdOfBlockItem(record.id as number)).toBe(categoryId)
    expect(await database.channels.filter((r) => r.kind === 'movie').count()).toBe(0)
    expect(await database.channels.filter((r) => r.kind === 'episode').count()).toBe(1)
    expect((await resolveFavorites(SOURCE_ID, 'movie', [byId('m2')], database)).records.map((r) => r.name)).toEqual(['Dois'])

    expect(await convertLegacyCategories(SOURCE_ID, {}, database)).toBe(false)
    expect(await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)).toHaveLength(2)
  })

  // FR-006: varreduras de um tipo ("Todos", busca, Semelhantes, favoritos por nome/id) enxergam blocos e
  // linhas antigas juntos, sem duplicar.
  it('varreduras de um tipo leem blocos e formato antigo juntos, sem duplicar', async () => {
    const block = await category('movie', 0, '10')
    await storeCategoryItems(block.target, [item('movie', 0, { name: 'Bloco', originalName: 'Bloco' })], 100, database)
    const legacy = await category('movie', 1, '11')
    await database.categories.update(legacy.id, { itemsFetchedAt: 100, itemsCount: 1 })
    await database.channels.add(item('movie', 1, { providerStreamId: 'l1', name: 'Antigo', categoryId: legacy.id }))

    // Só a categoria antiga tem linha; a gravada em bloco, nenhuma.
    expect(await database.channels.filter((r) => r.kind === 'movie').count()).toBe(1)
    const all = await listAllOfKind(SOURCE_ID, 'movie', database)
    expect(all.map((r) => r.name).sort()).toEqual(['Antigo', 'Bloco'])

    const byName: StableIdParts = { sourceId: SOURCE_ID, kind: 'movie', identifier: { type: 'name', value: 'bloco' } }
    const { records, unresolved } = await resolveFavorites(SOURCE_ID, 'movie', [byName, byId('l1'), byId('nao-existe')], database)
    expect(records.map((r) => r.name)).toEqual(['Bloco', 'Antigo'])
    expect(unresolved).toBe(1)
    expect(await countChannels(SOURCE_ID, 1, 'movie', database)).toBe(1)
  })

  // FR-002/FR-028 da 038 com blocos: categoria removida numa atualização leva o bloco junto; a mantida
  // continua servindo os itens de antes.
  it('categoria removida numa atualização some com o bloco; a mantida continua servindo', async () => {
    const keep = await category('movie', 0, '10')
    const gone = await category('movie', 1, '11')
    await storeCategoryItems(keep.target, [item('movie', 0, { providerStreamId: 'k' })], 100, database)
    await storeCategoryItems(gone.target, [item('movie', 1, { providerStreamId: 'g' })], 100, database)
    const [goneItem] = await listChannels(SOURCE_ID, 1, 0, 10, 'movie', database)
    const [keepItem] = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(categoryIdOfBlockItem(goneItem.id as number)).toBe(gone.id)

    await applyStructureRefresh(
      SOURCE_ID,
      1,
      ['movie'],
      [{ kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '10', name: 'Cat 10', position: 0 }],
      500,
      database,
    )

    expect(await getChannel(goneItem.id as number, database)).toBeUndefined()
    expect((await getChannel(keepItem.id as number, database))?.providerStreamId).toBe('k')
    expect(await listAllOfKind(SOURCE_ID, 'movie', database)).toHaveLength(1)
  })
})

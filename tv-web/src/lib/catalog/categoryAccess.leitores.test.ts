import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord, type CategoryKind, type UserStateRecord } from './db'
import {
  getActiveCategoryBlock,
  getChannel,
  listChannels,
  renewCategoryItems,
  resolveContinueWatching,
  resolveFavorites,
  storeCategories,
} from './catalogRepository'
import { readKindCursorPage } from './kindCursor'
import { setCategoryPreference } from './categoryAccess'
import { buildStableId, parseStableId, type StableIdParts } from './userStateRepository'

/**
 * Feature 066 (T018): os leitores que o contrato não percorre — "Todos" aos poucos, a categoria aberta por um cache
 * velho, item em duas categorias e o episódio de uma série escondida no "Continuar assistindo".
 */

const SOURCE = 'fonte-leitores'
let database: CatalogDb

beforeEach(() => {
  database = new CatalogDb(`TestDB_066_leitores_${Math.random()}`)
})

afterEach(async () => {
  await database.delete()
  database.close()
})

const record = (kind: CategoryKind, id: string, groupOrder: number, extra: Partial<CatalogRecord> = {}): CatalogRecord => ({
  sourceId: SOURCE, generation: 1, kind, name: `Item ${id}`, originalName: `Item ${id}`, groupOrder, providerStreamId: id, addedAt: 1, ...extra,
})

/** Categorias de um tipo, cada uma com os seus itens em bloco; devolve os ids locais na ordem. */
async function seed(kind: CategoryKind, categories: Array<{ name: string; pid: string; items: CatalogRecord[] }>) {
  await database.sources.put({ id: SOURCE, type: 'provider_credentials', displayName: SOURCE, connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  const ids = await storeCategories(
    categories.map((category, order) => ({ sourceId: SOURCE, generation: 1, kind, fetchMode: 'on_demand' as const, name: category.name, order, providerCategoryId: category.pid })),
    database,
  )
  for (const [order, category] of categories.entries()) {
    await renewCategoryItems({ sourceId: SOURCE, generation: 1, kind, categoryId: ids[order], groupOrder: order }, category.items, 1, database)
  }
  return ids
}

const hide = (kind: CategoryKind, pid: string, name: string) =>
  setCategoryPreference({ sourceId: SOURCE, kind, providerCategoryId: pid, name }, { hidden: true }, database)

const ids = (records: CatalogRecord[]) => records.map((item) => item.providerStreamId).sort()

describe('066 — leitores sem itens escondidos', () => {
  it('"Todos" aos poucos (cursor) pula a categoria escondida e não a conta', async () => {
    await seed('movie', [
      { name: 'Ação', pid: '1', items: [record('movie', 'a1', 0), record('movie', 'a2', 0)] },
      { name: 'Terror', pid: '2', items: [record('movie', 't1', 1)] },
    ])
    await hide('movie', '2', 'Terror')

    const page = await readKindCursorPage(SOURCE, 'movie', undefined, 50, database)
    expect(ids(page.items)).toEqual(['a1', 'a2'])
    expect(page.totalCategories).toBe(1)
  })

  it('a categoria escondida pedida direto (cache velho, id guardado) lê vazio — bloco, janela e item', async () => {
    const [, terror] = await seed('movie', [
      { name: 'Ação', pid: '1', items: [record('movie', 'a1', 0)] },
      { name: 'Terror', pid: '2', items: [record('movie', 't1', 1)] },
    ])
    const block = await getActiveCategoryBlock(SOURCE, terror, database)
    const itemId = block ? (await listChannels(SOURCE, 1, 0, 10, 'movie', database))[0].id : undefined
    expect(itemId).toBeDefined()

    await hide('movie', '2', 'Terror')

    expect(await getActiveCategoryBlock(SOURCE, terror, database)).toBeUndefined()
    expect(await listChannels(SOURCE, 1, 0, 10, 'movie', database)).toEqual([])
    expect(await getChannel(itemId as number, database)).toBeUndefined()
    expect(ids(await listChannels(SOURCE, 0, 0, 10, 'movie', database))).toEqual(['a1'])
  })

  it('item em duas categorias continua visível pela categoria livre', async () => {
    await seed('movie', [
      { name: 'Ação', pid: '1', items: [record('movie', 'x', 0)] },
      { name: 'Terror', pid: '2', items: [record('movie', 'x', 1)] },
    ])
    await hide('movie', '2', 'Terror')

    const favorite = parseStableId(buildStableId({ sourceId: SOURCE, kind: 'movie', providerStreamId: 'x' })) as StableIdParts
    const resolved = await resolveFavorites(SOURCE, 'movie', [favorite], database)
    expect(ids(resolved.records)).toEqual(['x'])
    expect(resolved.records[0].groupOrder).toBe(0)
  })

  it('episódio de série de categoria escondida some do "Continuar assistindo" e volta ao mostrar', async () => {
    await seed('series', [{ name: 'Dramas', pid: '5', items: [record('series', 'serie-1', 0, { seriesId: 'srv-1', providerStreamId: undefined })] }])
    await database.channels.add({
      sourceId: SOURCE, generation: 1, kind: 'episode', name: 'Piloto', originalName: 'Piloto', groupOrder: 0, seriesId: 'srv-1', providerStreamId: '55', seasonNumber: 1, episodeNumber: 1,
    })
    const stableId = buildStableId({ sourceId: SOURCE, kind: 'episode', providerStreamId: '55', seasonNumber: 1, episodeNumber: 1 })
    const state: UserStateRecord = { stableId, sourceId: SOURCE, isFavorite: false, progressSeconds: 120, createdAt: 0, updatedAt: 0 }

    expect((await resolveContinueWatching(SOURCE, [state], database)).map((item) => item.kind)).toEqual(['series'])

    await hide('series', '5', 'Dramas')
    expect(await resolveContinueWatching(SOURCE, [state], database)).toEqual([])

    await setCategoryPreference({ sourceId: SOURCE, kind: 'series', providerCategoryId: '5', name: 'Dramas' }, { hidden: false }, database)
    expect((await resolveContinueWatching(SOURCE, [state], database)).map((item) => item.kind)).toEqual(['series'])
  })
})

describe('066 — retomar depois do segundo plano (FR-020)', () => {
  it('episódio de série de categoria escondida/bloqueada não resolve por id (a reprodução não retoma); livre, resolve', async () => {
    await seed('series', [{ name: 'Dramas', pid: '5', items: [record('series', 'serie-1', 0, { seriesId: 'srv-1', providerStreamId: undefined })] }])
    const episodeId = await database.channels.add({
      sourceId: SOURCE, generation: 1, kind: 'episode', name: 'Piloto', originalName: 'Piloto', groupOrder: 0, seriesId: 'srv-1', providerStreamId: '55', seasonNumber: 1, episodeNumber: 1,
    })
    expect((await getChannel(episodeId as number, database))?.name).toBe('Piloto')

    await hide('series', '5', 'Dramas')
    expect(await getChannel(episodeId as number, database)).toBeUndefined()
  })
})

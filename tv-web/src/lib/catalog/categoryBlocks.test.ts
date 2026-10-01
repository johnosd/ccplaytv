import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord, type UserStateRecord } from './db'
import {
  getActiveCategoryBlock,
  getChannel,
  kindSortFields,
  listAllOfKind,
  listChannels,
  readKindPage,
  renewCategoryItems,
  resolveContinueWatching,
  storeCategories,
} from './catalogRepository'
import { buildStableId } from './userStateRepository'
import { loadHistory } from './history'
import { BLOCK_ID_SPACE, blockItemId, categoryIdOfBlockItem, convertLegacyCategories, identityKey } from './categoryBlocks'

let database: CatalogDb
const SOURCE_ID = 'fonte-1'

beforeEach(async () => {
  database = new CatalogDb(`test-blocos-extra-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'm3u_url',
    displayName: 'Lista',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function channel(name: string, extra: Partial<CatalogRecord> = {}): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind: 'channel', name, originalName: name, groupOrder: 0, ...extra }
}

async function seedCategory() {
  const [categoryId] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'channel', fetchMode: 'stored', name: 'Esportes', order: 0 }],
    database,
  )
  return { categoryId, target: { sourceId: SOURCE_ID, generation: 1, kind: 'channel' as const, categoryId, groupOrder: 0 } }
}

describe('blockItemId / categoryIdOfBlockItem (feature 039, §3)', () => {
  it('slot ocupado avança para o próximo livre, sempre do mesmo jeito (R-004)', () => {
    const first = blockItemId(7, 'p:1', new Set())
    const collided = blockItemId(7, 'p:1', new Set([first]))
    expect(collided).toBe(first - 1)
    expect(blockItemId(7, 'p:1', new Set([first]))).toBe(collided)
    expect(categoryIdOfBlockItem(first)).toBe(7)
    expect(categoryIdOfBlockItem(collided)).toBe(7)
  })

  it('o id codifica a categoria; id positivo (linha antiga) não é de bloco', () => {
    const id = blockItemId(123456, 'n:Canal', new Set())
    expect(id).toBeLessThan(0)
    expect(Number.isSafeInteger(id)).toBe(true)
    expect(-id).toBeGreaterThanOrEqual(123456 * BLOCK_ID_SPACE)
    expect(categoryIdOfBlockItem(id)).toBe(123456)
    expect(categoryIdOfBlockItem(42)).toBeUndefined()
    expect(categoryIdOfBlockItem(0)).toBeUndefined()
  })

  it('identidade: série pelo seriesId, provedor pelo id, M3U pelo nome original — nunca pela URL', () => {
    expect(identityKey({ kind: 'series', seriesId: 's1', providerStreamId: '9', originalName: 'X' })).toBe('s:s1')
    expect(identityKey({ kind: 'movie', providerStreamId: '9', originalName: 'X' })).toBe('p:9')
    expect(identityKey({ kind: 'channel', originalName: 'X' })).toBe('n:X')
  })
})

describe('convertLegacyCategories (feature 039, §6)', () => {
  async function seedLegacy(order: number, fetchMode: 'stored' | 'eager', names: string[], itemsFetchedAt?: number) {
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'channel', fetchMode, name: `Cat ${order}`, order }],
      database,
    )
    if (itemsFetchedAt !== undefined) await database.categories.update(categoryId, { itemsFetchedAt })
    await database.channels.bulkAdd(names.map((name, index) => channel(name, { groupOrder: order, categoryId, categoryPosition: index })))
    return categoryId
  }

  it('erro no meio: a categoria que falhou continua inteira em linhas, e a retomada termina sem duplicar', async () => {
    await seedLegacy(0, 'stored', ['A', 'B'], 10)
    const second = await seedLegacy(1, 'eager', ['C', 'D'], 20)

    const put = database.categoryBlocks.put.bind(database.categoryBlocks)
    let calls = 0
    vi.spyOn(database.categoryBlocks, 'put').mockImplementation((...args) => {
      calls += 1
      if (calls === 2) return Promise.reject(new Error('interrompido')) as never
      return put(...args)
    })

    expect(await convertLegacyCategories(SOURCE_ID, { maxCategories: 1 }, database)).toBe(true)
    await expect(convertLegacyCategories(SOURCE_ID, { maxCategories: 1 }, database)).rejects.toThrow('interrompido')
    // A transação desfez tudo: a 2ª categoria segue legível, nas linhas.
    expect((await listChannels(SOURCE_ID, 1, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['C', 'D'])
    expect(await database.categoryBlocks.get(second)).toBeUndefined()

    vi.restoreAllMocks()
    const converted: number[] = []
    while (await convertLegacyCategories(SOURCE_ID, { onConverted: (id) => converted.push(id) }, database)) {
      // parte por parte
    }
    expect(converted).toEqual([second])
    expect(await database.channels.count()).toBe(0)
    expect((await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['A', 'B'])
    expect((await listChannels(SOURCE_ID, 1, 0, 10, 'channel', database)).map((r) => r.name)).toEqual(['C', 'D'])
    // Converter não é renovar.
    expect((await database.categories.get(second))?.itemsFetchedAt).toBe(20)
  })

  it('categoria sem linhas (guardada e nunca aberta) e sem bloco não conta como pendente', async () => {
    await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'stored', name: 'Filmes', order: 0 }],
      database,
    )
    expect(await convertLegacyCategories(SOURCE_ID, {}, database)).toBe(false)
    expect(await database.categoryBlocks.count()).toBe(0)
  })
})

describe('escrita do bloco (feature 039, §4)', () => {
  it('M3U com nomes repetidos: cada cópia tem id próprio, e a renovação mantém os dois', async () => {
    const { target } = await seedCategory()
    await renewCategoryItems(target, [channel('Canal HD', { directUrl: 'http://a/1' }), channel('Canal HD', { directUrl: 'http://a/2' })], 1, database)
    const before = await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)
    expect(new Set(before.map((r) => r.id)).size).toBe(2)

    // Token novo na URL: a assinatura muda, as identidades (nome) não.
    await renewCategoryItems(target, [channel('Canal HD', { directUrl: 'http://b/1' }), channel('Canal HD', { directUrl: 'http://b/2' })], 2, database)
    const after = await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id))
    expect(after.map((r) => r.directUrl)).toEqual(['http://b/1', 'http://b/2'])
    expect(after.map((r) => r.categoryPosition)).toEqual([0, 1])
  })

  it('categoria removida enquanto a busca voava: nada é gravado', async () => {
    const { categoryId, target } = await seedCategory()
    await database.categories.delete(categoryId)
    expect(await renewCategoryItems(target, [channel('A')], 1, database)).toEqual({ written: false })
    expect(await database.categoryBlocks.count()).toBe(0)
  })

  it('getChannel não devolve item de bloco de geração que não é a ativa', async () => {
    const { target } = await seedCategory()
    await renewCategoryItems(target, [channel('A')], 1, database)
    const [record] = await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)
    expect(await getChannel(record.id as number, database)).toMatchObject({ name: 'A', categoryPosition: 0 })

    await database.sources.update(SOURCE_ID, { activeGeneration: 2 })
    expect(await getChannel(record.id as number, database)).toBeUndefined()
  })
})

describe('resolveContinueWatching em lote (feature 039, T019)', () => {
  it('uma passada pelos blocos por tipo; ordem de entrada mantida, episódio vira a série, sem correspondência some', async () => {
    const [moviesA, moviesB, seriesCat] = await storeCategories(
      [
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes A', order: 1 },
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes B', order: 2 },
        { sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', name: 'Séries', order: 3 },
      ],
      database,
    )
    const item = (kind: 'movie' | 'series', name: string, groupOrder: number, extra: Partial<CatalogRecord>): CatalogRecord => ({
      sourceId: SOURCE_ID,
      generation: 1,
      kind,
      name,
      originalName: name,
      groupOrder,
      ...extra,
    })
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: moviesA, groupOrder: 1 }, [item('movie', 'Filme 1', 1, { providerStreamId: 'm1' })], 1, database)
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: moviesB, groupOrder: 2 }, [item('movie', 'Filme 2', 2, { providerStreamId: 'm2' })], 1, database)
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'series', categoryId: seriesCat, groupOrder: 3 }, [item('series', 'Série', 3, { seriesId: 's1' })], 1, database)
    await database.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'episode',
      name: 'S01E01',
      originalName: 'S01E01',
      groupOrder: 3,
      seriesId: 's1',
      providerStreamId: 'e1',
      seasonNumber: 1,
      episodeNumber: 1,
    })
    const state = (stableId: string): UserStateRecord => ({ stableId, sourceId: SOURCE_ID, isFavorite: false, createdAt: 1, updatedAt: 1 })
    const states = [
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'm2' })),
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'episode', providerStreamId: 'e1', seriesId: 's1', seasonNumber: 1, episodeNumber: 1 })),
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'nao-existe' })),
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'm1' })),
    ]
    const where = vi.spyOn(database.categoryBlocks, 'where')

    const records = await resolveContinueWatching(SOURCE_ID, states, database)

    expect(records.map((record) => record.name)).toEqual(['Filme 2', 'Série', 'Filme 1'])
    expect(records[1]).toMatchObject({ kind: 'series', seriesId: 's1' })
    // Filmes: 1 passada (antes: uma por filme); séries-pai: 1 passada.
    expect(where).toHaveBeenCalledTimes(2)
  })
})

describe('readKindPage — "Todos" aos poucos (feature 039, T022)', () => {
  it('páginas concatenadas = listAllOfKind (blocos e linhas antigas misturados), sem partir categoria', async () => {
    const orders = [5, 1, 3, 2, 4]
    const ids = await storeCategories(
      orders.map((order) => ({ sourceId: SOURCE_ID, generation: 1, kind: 'channel' as const, fetchMode: 'on_demand' as const, name: `C${order}`, order })),
      database,
    )
    for (const [i, order] of orders.entries()) {
      const items = Array.from({ length: order }, (_, n) => channel(`C${order}-${n}`, { groupOrder: order, providerStreamId: `${order}-${n}` }))
      if (order === 3) {
        // Categoria ainda no formato antigo (linhas), no meio da ordem.
        await database.channels.bulkAdd(items.map((item, n) => ({ ...item, categoryId: ids[i], categoryPosition: n })))
      } else {
        await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'channel', categoryId: ids[i], groupOrder: order }, items, 1, database)
      }
    }

    const names: string[] = []
    const pageSizes: number[] = []
    let cursor: number | undefined = 0
    while (cursor !== undefined) {
      const page = await readKindPage(SOURCE_ID, 'channel', cursor, 4, database)
      const pageNames = page.chunks.flatMap((chunk) => ('block' in chunk ? chunk.block.items : chunk.rows).map((item) => item.name))
      names.push(...pageNames)
      pageSizes.push(pageNames.length)
      cursor = page.next
    }
    expect(names).toEqual((await listAllOfKind(SOURCE_ID, 'channel', database)).map((record) => record.name))
    // Categorias inteiras até passar de 4: [1+2+3=6], [4], [5].
    expect(pageSizes).toEqual([6, 4, 5])
  })

  it('sem geração ativa ou tipo episódio: página vazia e fim', async () => {
    expect(await readKindPage(SOURCE_ID, 'episode', 0, 10, database)).toEqual({ chunks: [], next: undefined })
    await database.sources.update(SOURCE_ID, { activeGeneration: undefined })
    expect(await readKindPage(SOURCE_ID, 'channel', 0, 10, database)).toEqual({ chunks: [], next: undefined })
  })
})

describe('↺ Histórico de Séries em lote (feature 039, T034)', () => {
  it('uma passada pelos blocos de séries; série uma vez só, na ordem do mais recente; episódio sem série conta como não resolvido', async () => {
    const [seriesCat] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', name: 'Séries', order: 1 }],
      database,
    )
    const series = (name: string, seriesId: string): CatalogRecord => ({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'series',
      name,
      originalName: name,
      groupOrder: 1,
      seriesId,
    })
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'series', categoryId: seriesCat, groupOrder: 1 }, [series('Dark', 's1'), series('Lost', 's2')], 1, database)
    const episode = (id: string, seriesId: string, n: number): CatalogRecord => ({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'episode',
      name: id,
      originalName: id,
      groupOrder: 1,
      seriesId,
      providerStreamId: id,
      seasonNumber: 1,
      episodeNumber: n,
    })
    await database.channels.bulkAdd([episode('e1', 's1', 1), episode('e2', 's2', 1), episode('e3', 's1', 2), episode('orfao', 's9', 1)])
    const played = (id: string, seriesId: string, n: number, at: number) => ({
      stableId: buildStableId({ sourceId: SOURCE_ID, kind: 'episode', providerStreamId: id, seriesId, seasonNumber: 1, episodeNumber: n }),
      sourceId: SOURCE_ID,
      isFavorite: false,
      progressSeconds: 10,
      lastWatched: at,
      createdAt: 1,
      updatedAt: at,
    })
    await database.userStates.bulkPut([played('e3', 's1', 2, 40), played('e2', 's2', 1, 30), played('e1', 's1', 1, 20), played('orfao', 's9', 1, 10)])
    const where = vi.spyOn(database.categoryBlocks, 'where')

    const result = await loadHistory(SOURCE_ID, 'series', database)

    expect(result.records.map((record) => record.name)).toEqual(['Dark', 'Lost'])
    expect(result.unresolved).toBe(1) // o episódio da série que não está na lista
    expect(where).toHaveBeenCalledTimes(1) // antes: uma varredura por série
  })
})

describe('kindSortFields (feature 039, T033)', () => {
  it('acha ano/data de inclusão em qualquer bloco do tipo e nas linhas antigas; sem nenhum, false', async () => {
    const [a, b] = await storeCategories(
      [1, 2].map((order) => ({ sourceId: SOURCE_ID, generation: 1, kind: 'channel' as const, fetchMode: 'on_demand' as const, name: `C${order}`, order })),
      database,
    )
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'channel', categoryId: a, groupOrder: 1 }, [channel('Sem nada', { groupOrder: 1 })], 1, database)
    expect(await kindSortFields(SOURCE_ID, 'channel', database)).toEqual({ year: false, addedAt: false })

    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'channel', categoryId: b, groupOrder: 2 }, [channel('Com ano', { groupOrder: 2, year: 2001 })], 1, database)
    expect(await kindSortFields(SOURCE_ID, 'channel', database)).toEqual({ year: true, addedAt: false })

    await database.channels.add(channel('Linha antiga', { groupOrder: 3, addedAt: 5 }))
    expect(await kindSortFields(SOURCE_ID, 'channel', database)).toEqual({ year: true, addedAt: true })
  })
})

describe('getActiveCategoryBlock (feature 039, R-009 — caminho rápido de abrir categoria)', () => {
  it('devolve o bloco da geração ativa, na ordem da fonte, com os mesmos ids que listChannels', async () => {
    const { categoryId, target } = await seedCategory()
    await renewCategoryItems(target, [channel('B'), channel('A'), channel('C')], 1, database)

    const block = await getActiveCategoryBlock(SOURCE_ID, categoryId, database)
    const listed = await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)
    expect(block?.items.map((item) => item.name)).toEqual(['B', 'A', 'C'])
    expect(block?.items.map((item) => item.id)).toEqual(listed.map((record) => record.id))
  })

  it('sem bloco (formato antigo), de outra fonte ou de geração que não é a ativa: undefined', async () => {
    const { categoryId, target } = await seedCategory()
    expect(await getActiveCategoryBlock(SOURCE_ID, categoryId, database)).toBeUndefined()

    await renewCategoryItems(target, [channel('A')], 1, database)
    expect(await getActiveCategoryBlock('outra-fonte', categoryId, database)).toBeUndefined()

    await database.sources.update(SOURCE_ID, { activeGeneration: 2 })
    expect(await getActiveCategoryBlock(SOURCE_ID, categoryId, database)).toBeUndefined()
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { getChannel, listChannels, storeCategories, storeCategoryItems } from './catalogRepository'
import { makeRoomFor, PIN_WINDOW_MS, subscribeCatalogReleases, touchCategory } from './storageBudget'
import { categoryStoredBytes, LEGACY_EPG_ROW_BYTES, METADATA_BYTES } from './storageLedger'
import { releaseCandidates, releaseInactiveList, releaseTemporary } from './storageRelease'
import { catalogLedger } from './storageLedger'
import { epgChunks } from './chunkTables'
import { toggleFavorite } from './userStateRepository'

/** Feature 082, T032/T038: o que o orçamento pode e nunca pode liberar (`logic/orcamento.md` §4, D-007). */

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`release-${Math.random().toString(36).slice(2)}`)
  await database.open()
  for (const id of ['ativa', 'outra']) {
    await database.sources.add({ id, type: 'provider_credentials', displayName: id, connectionState: 'synced', activeGeneration: 1,
      createdAt: 1, updatedAt: 1 })
  }
})
afterEach(async () => { await database.delete() })

const movies = (sourceId: string, order: number, prefix: string, count = 200): CatalogRecord[] =>
  Array.from({ length: count }, (_, index) => ({ sourceId, generation: 1, kind: 'movie', groupOrder: order,
    name: `${prefix} ${index}`, originalName: `${prefix} ${index}`, providerStreamId: `${prefix}${index}` }))

async function category(sourceId: string, order: number, prefix: string, fetchMode: 'on_demand' | 'eager' | 'stored' = 'on_demand') {
  const [id] = await storeCategories([{ sourceId, generation: 1, kind: 'movie', order, fetchMode, providerCategoryId: prefix, name: prefix }], database)
  await storeCategoryItems({ sourceId, generation: 1, kind: 'movie', groupOrder: order, categoryId: id }, movies(sourceId, order, prefix), 1, database)
  return id
}

describe('liberação do orçamento', () => {
  it('lista inativa: sai só o que pode ser refeito (categorias sob demanda, guia, metadados); estado da pessoa e eager/stored ficam', async () => {
    const onDemand = await category('outra', 0, 'od')
    const eager = await category('outra', 1, 'eg', 'eager')
    const stored = await category('outra', 2, 'st', 'stored')
    await database.sources.update('outra', { epgActiveGeneration: 1, epgStoredBytes: 10, epgLastSyncAt: 5 })
    await epgChunks(database).put({ sourceId: 'outra', generation: 1, channelKey: 'c', from: 0, to: 1, count: 1, bytes: new Uint8Array([1]) })
    await database.titleMetadata.put({ stableId: 'outra|movie|id:od1', sourceId: 'outra' } as never)
    await database.userStates.put({ stableId: 'outra|movie|id:od1', sourceId: 'outra', isFavorite: true, favoritedAt: 2, createdAt: 2, updatedAt: 2 })

    expect(await releaseInactiveList(database, 'outra')).toEqual([onDemand])

    expect(await categoryStoredBytes(database, onDemand)).toBe(0)
    expect(await categoryStoredBytes(database, eager)).toBeGreaterThan(0)
    expect(await categoryStoredBytes(database, stored)).toBeGreaterThan(0)
    expect(await epgChunks(database).count()).toBe(0)
    const source = await database.sources.get('outra')
    expect([source?.epgActiveGeneration, source?.epgLastSyncAt, source?.epgStoredBytes]).toEqual([undefined, undefined, undefined])
    expect(await database.titleMetadata.count()).toBe(0)
    expect(await database.userStates.count()).toBe(1)
    expect(await database.categories.count()).toBe(3)
  })

  it('entrada no teto nunca libera a categoria com favorito ou "Continuar assistindo" da lista ativa', async () => {
    const favorite = await category('ativa', 0, 'fav')
    const watching = await category('ativa', 1, 'cont')
    const free = await category('ativa', 2, 'livre')
    await database.userStates.bulkPut([
      { stableId: 'ativa|movie|id:fav3', sourceId: 'ativa', isFavorite: true, favoritedAt: 2, createdAt: 2, updatedAt: 2 },
      { stableId: 'ativa|movie|id:cont7', sourceId: 'ativa', isFavorite: false, progressSeconds: 60, lastWatched: 3, createdAt: 3, updatedAt: 3 },
    ])
    const ledger = await catalogLedger(database)
    const now = 10 + PIN_WINDOW_MS

    const result = await makeRoomFor('ativa', 1, { database, now, mode: 'entry', config: { capBytes: ledger.total - 1 } })

    expect(result.released.map((candidate) => candidate.categoryId)).toEqual([free])
    expect(await categoryStoredBytes(database, favorite)).toBeGreaterThan(0)
    expect(await categoryStoredBytes(database, watching)).toBeGreaterThan(0)
    expect(result.fits).toBe(true)
  })

  it('pré-carga no teto devolve fits=false sem liberar a lista ativa', async () => {
    const id = await category('ativa', 0, 'a')
    const ledger = await catalogLedger(database)
    const result = await makeRoomFor('ativa', 10_000, { database, mode: 'prefetch', config: { capBytes: ledger.total } })
    expect(result).toEqual({ fits: false, released: [] })
    expect(await categoryStoredBytes(database, id)).toBeGreaterThan(0)
  })

  it('a categoria usada há pouco e a do item tocando ficam, e getChannel continua achando o item (T038)', async () => {
    const open = await category('ativa', 0, 'aberta')
    const playing = await category('ativa', 1, 'tocando')
    const old = await category('ativa', 2, 'velha')
    const now = 100 + PIN_WINDOW_MS * 3
    touchCategory(open, now - 1_000, database)
    const [item] = await listChannels('ativa', 1, 0, 1, 'movie', database)
    // `resolvePlaybackUrl` marca a categoria do item que vai tocar.
    touchCategory(item.categoryId as number, now - 2_000, database)
    const ledger = await catalogLedger(database)

    const result = await makeRoomFor('ativa', 1, { database, now, mode: 'entry', config: { capBytes: ledger.total - 1 } })

    expect(result.released.map((candidate) => candidate.categoryId)).toEqual([old])
    expect(item.categoryId).toBe(playing)
    expect((await getChannel(item.id as number, database))?.name).toBe(item.name)
    expect(await categoryStoredBytes(database, open)).toBeGreaterThan(0)
  })

  it('avisa as telas, agrupado, com as categorias liberadas (T040)', async () => {
    await category('ativa', 0, 'a')
    const gone = await category('outra', 0, 'b')
    const seen: Array<[string, number[]]> = []
    const off = subscribeCatalogReleases((sourceId, ids) => seen.push([sourceId, ids]))
    const ledger = await catalogLedger(database)
    await makeRoomFor('ativa', 1, { database, mode: 'prefetch', config: { capBytes: ledger.total - 1 } })
    off()
    expect(seen).toEqual([['outra', [gone]]])
  })

  it('favoritar com o catálogo no teto grava na 1ª tentativa: a reserva é da pessoa', async () => {
    await category('ativa', 0, 'a')
    const ledger = await catalogLedger(database)
    expect((await makeRoomFor('ativa', 10_000, { database, mode: 'prefetch', config: { capBytes: ledger.total } })).fits).toBe(false)
    await toggleFavorite('ativa|movie|id:a1', 'ativa', true, database)
    expect((await database.userStates.get('ativa|movie|id:a1'))?.isFavorite).toBe(true)
  })

  it('não oferece categoria eager/stored da lista ativa como liberável', async () => {
    await category('ativa', 0, 'od')
    await category('ativa', 1, 'eg', 'eager')
    const ledger = await catalogLedger(database)
    const candidates = await releaseCandidates(database, { activeSourceId: 'ativa', ledger, lastUsedOf: () => 0, isRecent: () => false })
    expect(candidates.filter((candidate) => candidate.refetchable).map((candidate) => candidate.key)).toEqual(['category:1'])
  })

  // Ajuste ad-hoc (assessment orcamento-armazenamento-makeroomfor): os candidatos reaproveitam a contagem de guia antigo do ledger.
  it('o candidato de guia antigo usa a contagem do ledger e as listas são contadas em paralelo, com o mesmo resultado', async () => {
    for (let index = 0; index < 3; index += 1) {
      await database.epgPrograms.add({ sourceId: 'outra', generation: 1, channelKey: `c${index}`, title: 't', start: index, stop: index + 1 } as never)
    }
    const ledger = await catalogLedger(database)
    expect(ledger.legacyGuideRows).toEqual({ ativa: 0, outra: 3 })
    // O banco tem 3 linhas, mas o candidato obedece ao ledger entregue (prova de que não refaz a contagem).
    const candidates = await releaseCandidates(database, { activeSourceId: 'ativa', ledger: { ...ledger, legacyGuideRows: { ativa: 0, outra: 7 } }, lastUsedOf: () => 0, isRecent: () => false })
    expect(candidates.find((candidate) => candidate.key === 'legacy-guide:outra')?.bytes).toBe(7 * LEGACY_EPG_ROW_BYTES)
    // Sem a contagem no ledger (conta feita por outro caminho), cai para a contagem do próprio banco.
    const { legacyGuideRows: _omit, ...withoutCount } = ledger
    const fallback = await releaseCandidates(database, { activeSourceId: 'ativa', ledger: withoutCount, lastUsedOf: () => 0, isRecent: () => false })
    expect(fallback.find((candidate) => candidate.key === 'legacy-guide:outra')?.bytes).toBe(3 * LEGACY_EPG_ROW_BYTES)
  })

  it('metadados e guia antigo são atribuídos à lista certa', async () => {
    await database.titleMetadata.bulkPut([
      { stableId: 'a|movie|1', sourceId: 'ativa' }, { stableId: 'a|movie|2', sourceId: 'ativa' }, { stableId: 'o|movie|1', sourceId: 'outra' },
    ] as never)
    await database.epgPrograms.add({ sourceId: 'ativa', generation: 1, channelKey: 'c', title: 't', start: 0, stop: 1 } as never)
    const ledger = await catalogLedger(database)
    expect(ledger.bySource).toEqual({ ativa: 2 * METADATA_BYTES + LEGACY_EPG_ROW_BYTES, outra: METADATA_BYTES })
    expect(ledger.legacyGuideRows).toEqual({ ativa: 1, outra: 0 })
  })

  // Feature 085, T013: o preparo é contado e liberado só por chave de índice (FR-001, FR-005).
  describe('preparo de seção (feature 085)', () => {
    const part = (sourceId: string, categoryId: number) => ({ sourceId, categoryId, items: movies(sourceId, 0, `p${categoryId}`, 3) })
    const context = (activeSourceId?: string) => ({ activeSourceId, ledger: { total: 0, bySource: {}, byCategory: new Map() } as never,
      lastUsedOf: () => 0, isRecent: () => false })

    it('preparo só da lista ativa não vira candidato "temporário"', async () => {
      await database.sectionStaging.bulkAdd([part('ativa', 1), part('ativa', 2)])
      const candidates = await releaseCandidates(database, context('ativa'))
      expect(candidates.find((candidate) => candidate.key === 'temporary')).toBeUndefined()
    })

    it('com preparo da ativa e de outras listas, os bytes são só as linhas das outras', async () => {
      await database.sectionStaging.bulkAdd([part('ativa', 1), part('outra', 1), part('outra', 2), part('terceira', 1)])
      const temporary = (await releaseCandidates(database, context('ativa'))).find((candidate) => candidate.key === 'temporary')
      expect(temporary?.bytes).toBe(3 * METADATA_BYTES)
    })

    it('releaseTemporary mantém a lista ativa e apaga todas as outras', async () => {
      await database.sectionStaging.bulkAdd([part('ativa', 1), part('outra', 1), part('terceira', 1), part('terceira', 2)])
      expect((await releaseTemporary(database, 'ativa')).staging).toBe(true)
      expect((await database.sectionStaging.toArray()).map((row) => row.sourceId)).toEqual(['ativa'])
      expect((await releaseTemporary(database, 'ativa')).staging).toBe(false)
    })
  })
})

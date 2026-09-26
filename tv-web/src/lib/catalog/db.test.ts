import Dexie, { type EntityTable } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CatalogDb,
  type CatalogRecord,
  type CategoryRecord,
  type SourceRecord,
  type UserStateRecord,
} from './db'

let dbName: string

afterEach(async () => {
  if (dbName) await Dexie.delete(dbName)
})

/**
 * Réplica só até a v6 — o schema real antes desta feature. Serve para
 * simular um aparelho que já tinha dado gravado, sem duplicar o código de
 * produção (que já inclui a v7).
 */
class LegacyDb extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(1).stores({
      sources: 'id',
      channels: '++id, [sourceId+generation], [sourceId+generation+groupOrder]',
      importRuns: 'id, [sourceId+status]',
    })
    this.version(3).stores({
      channels:
        '++id, [sourceId+generation], [sourceId+generation+groupOrder], [sourceId+generation+kind+groupOrder]',
    })
    this.version(4).stores({ userStates: 'stableId, sourceId' })
    this.version(5).stores({ userStates: 'stableId, sourceId, isFavorite, lastWatched' })
    this.version(6).stores({ userStates: 'stableId, sourceId, favoritedAt, lastWatched' })
  }
}

describe('CatalogDb — schema v7 (feature 010)', () => {
  it('abre a coleção categories com o índice composto de leitura', async () => {
    dbName = `test-db-v7-${Math.random().toString(36).slice(2)}`
    const database = new CatalogDb(dbName)
    await database.open()

    const table = database.categories as EntityTable<CategoryRecord, 'id'>
    expect(table).toBeDefined()

    const id = await database.categories.add({
      sourceId: 'src-1',
      generation: 1,
      kind: 'movie',
      fetchMode: 'on_demand',
      providerCategoryId: '10',
      name: 'Ação',
      order: 0,
    })

    // Índice [sourceId+generation+kind+order] — caminho de leitura quente,
    // usado por listCategories a cada tela.
    const byOrder = await database.categories
      .where('[sourceId+generation+kind+order]')
      .equals(['src-1', 1, 'movie', 0])
      .first()
    expect(byOrder?.id).toBe(id)

    database.close()
  })

  it('categoria sem providerCategoryId (caminho eager) grava e é lida normalmente', async () => {
    // Regressão: um segundo índice composto com esse campo como último
    // componente quebrava até consultas em tabela vazia neste ambiente de
    // teste (Dexie 4 "virtual index" + fake-indexeddb). Removido por não
    // ter uso real — quem abre uma categoria já tem o objeto inteiro — e
    // este teste trava o caso que expôs o problema.
    dbName = `test-db-v7-eager-${Math.random().toString(36).slice(2)}`
    const database = new CatalogDb(dbName)
    await database.open()

    await database.categories.bulkAdd(
      [
        { sourceId: 'src-1', generation: 1, kind: 'channel', fetchMode: 'eager', name: 'Esportes', order: 0 },
        { sourceId: 'src-1', generation: 1, kind: 'channel', fetchMode: 'eager', name: 'Filmes', order: 1 },
      ],
      { allKeys: true },
    )

    const categories = await database.categories
      .where('[sourceId+generation+kind+order]')
      .between(['src-1', 1, 'channel', -1], ['src-1', 1, 'channel', Number.MAX_SAFE_INTEGER], true, true)
      .toArray()

    expect(categories.map((c) => c.name)).toEqual(['Esportes', 'Filmes'])
    expect(categories.every((c) => c.providerCategoryId === undefined)).toBe(true)

    database.close()
  })

  it('abrir um banco em v6 não perde dado nem converte por adivinhação', async () => {
    dbName = `test-db-migration-${Math.random().toString(36).slice(2)}`

    const legacy = new LegacyDb(dbName)
    await legacy.open()
    await (legacy.table('sources') as EntityTable<SourceRecord, 'id'>).add({
      id: 'src-1',
      type: 'm3u_url',
      displayName: 'Fonte antiga',
      m3uUrl: 'http://exemplo.test/lista.m3u',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await (legacy.table('channels') as EntityTable<CatalogRecord, 'id'>).add({
      sourceId: 'src-1',
      generation: 1,
      kind: 'channel',
      name: 'Canal Antigo',
      originalName: 'Canal Antigo',
      group: 'Esportes',
      groupOrder: 0,
    })
    await (legacy.table('userStates') as EntityTable<UserStateRecord, 'stableId'>).add({
      stableId: 'src-1|movie|id:1',
      sourceId: 'src-1',
      isFavorite: true,
      favoritedAt: 5,
      createdAt: 5,
      updatedAt: 5,
    })
    legacy.close()

    const upgraded = new CatalogDb(dbName)
    await upgraded.open()

    // Dado de v6 sobrevive, sem alteração.
    expect(await upgraded.sources.get('src-1')).toMatchObject({ displayName: 'Fonte antiga' })
    expect(await upgraded.channels.where('sourceId').equals('src-1').count()).toBe(1)
    expect(await upgraded.userStates.get('src-1|movie|id:1')).toMatchObject({ isFavorite: true })

    // categories nasce vazia — nenhuma conversão por adivinhação
    // (data-model.md §4: reconstruir providerCategoryId a partir de
    // groupOrder seria aproximação, que a constitution proíbe).
    expect(await upgraded.categories.count()).toBe(0)

    upgraded.close()
  })
})

/**
 * Réplica só até a v7 — o schema antes desta feature (012). Serve para
 * simular um aparelho com séries/canais já gravados, sem `seriesId` no
 * índice novo.
 */
class PreSeriesDb extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(1).stores({
      sources: 'id',
      channels: '++id, [sourceId+generation], [sourceId+generation+groupOrder]',
      importRuns: 'id, [sourceId+status]',
    })
    this.version(3).stores({
      channels:
        '++id, [sourceId+generation], [sourceId+generation+groupOrder], [sourceId+generation+kind+groupOrder]',
    })
    this.version(4).stores({ userStates: 'stableId, sourceId' })
    this.version(5).stores({ userStates: 'stableId, sourceId, isFavorite, lastWatched' })
    this.version(6).stores({ userStates: 'stableId, sourceId, favoritedAt, lastWatched' })
    this.version(7).stores({ categories: '++id, sourceId, [sourceId+generation+kind+order]' })
  }
}

describe('CatalogDb — schema v8 (feature 012)', () => {
  it('abrir um banco em v7 não perde dado e o índice [sourceId+generation+seriesId] fica disponível', async () => {
    dbName = `test-db-v8-migration-${Math.random().toString(36).slice(2)}`

    const legacy = new PreSeriesDb(dbName)
    await legacy.open()
    // Canal sem seriesId — o caso comum, que não deve quebrar nada.
    await (legacy.table('channels') as EntityTable<CatalogRecord, 'id'>).add({
      sourceId: 'src-1',
      generation: 1,
      kind: 'channel',
      name: 'Canal Antigo',
      originalName: 'Canal Antigo',
      group: 'Esportes',
      groupOrder: 0,
    })
    legacy.close()

    const upgraded = new CatalogDb(dbName)
    await upgraded.open()

    // Dado de v7 sobrevive, sem alteração.
    expect(await upgraded.channels.where('sourceId').equals('src-1').count()).toBe(1)

    // Registro sem seriesId não quebra a consulta pelo índice novo —
    // parte undefined de um índice composto simplesmente não indexa.
    const bySeries = await upgraded.channels
      .where('[sourceId+generation+seriesId]')
      .equals(['src-1', 1, 'srv-200'])
      .toArray()
    expect(bySeries).toEqual([])

    upgraded.close()
  })

  it('série e seus episódios são encontráveis pelo índice novo, sem varrer a tabela inteira', async () => {
    dbName = `test-db-v8-index-${Math.random().toString(36).slice(2)}`
    const database = new CatalogDb(dbName)
    await database.open()

    await database.channels.bulkAdd([
      {
        sourceId: 'src-1',
        generation: 1,
        kind: 'series',
        name: 'Breaking Bad',
        originalName: 'Breaking Bad',
        groupOrder: 0,
        seriesId: 'srv-200',
      },
      {
        sourceId: 'src-1',
        generation: 1,
        kind: 'episode',
        name: 'Pilot',
        originalName: 'Pilot',
        groupOrder: 0,
        seriesId: 'srv-200',
        seasonNumber: 1,
        episodeNumber: 1,
      },
      {
        sourceId: 'src-1',
        generation: 1,
        kind: 'movie',
        name: 'Filme sem série',
        originalName: 'Filme sem série',
        groupOrder: 1,
      },
    ])

    const records = await database.channels
      .where('[sourceId+generation+seriesId]')
      .equals(['src-1', 1, 'srv-200'])
      .toArray()
    expect(records.map((r) => r.kind).sort()).toEqual(['episode', 'series'])

    database.close()
  })
})

/** Réplica só até a v8 — o schema antes desta feature (013). */
class PreFavoritesDb extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(1).stores({
      sources: 'id',
      channels: '++id, [sourceId+generation], [sourceId+generation+groupOrder]',
      importRuns: 'id, [sourceId+status]',
    })
    this.version(3).stores({
      channels:
        '++id, [sourceId+generation], [sourceId+generation+groupOrder], [sourceId+generation+kind+groupOrder]',
    })
    this.version(4).stores({ userStates: 'stableId, sourceId' })
    this.version(5).stores({ userStates: 'stableId, sourceId, isFavorite, lastWatched' })
    this.version(6).stores({ userStates: 'stableId, sourceId, favoritedAt, lastWatched' })
    this.version(7).stores({ categories: '++id, sourceId, [sourceId+generation+kind+order]' })
    this.version(8).stores({
      channels:
        '++id, [sourceId+generation], [sourceId+generation+groupOrder], ' +
        '[sourceId+generation+kind+groupOrder], [sourceId+generation+seriesId]',
    })
  }
}

describe('CatalogDb — schema v9 (feature 013)', () => {
  it('abrir um banco em v8 não perde dado e o índice [sourceId+generation+kind+providerStreamId] fica disponível', async () => {
    dbName = `test-db-v9-migration-${Math.random().toString(36).slice(2)}`

    const legacy = new PreFavoritesDb(dbName)
    await legacy.open()
    await (legacy.table('channels') as EntityTable<CatalogRecord, 'id'>).add({
      sourceId: 'src-1',
      generation: 1,
      kind: 'channel',
      name: 'Canal Antigo',
      originalName: 'Canal Antigo',
      groupOrder: 0,
      providerStreamId: '100',
    })
    legacy.close()

    const upgraded = new CatalogDb(dbName)
    await upgraded.open()

    // Dado de v8 sobrevive, sem alteração.
    expect(await upgraded.channels.where('sourceId').equals('src-1').count()).toBe(1)

    const byStreamId = await upgraded.channels
      .where('[sourceId+generation+kind+providerStreamId]')
      .equals(['src-1', 1, 'channel', '100'])
      .toArray()
    expect(byStreamId).toHaveLength(1)
    expect(byStreamId[0]?.name).toBe('Canal Antigo')

    upgraded.close()
  })

  it('o mesmo providerStreamId em kinds diferentes não colide (índice inclui kind)', async () => {
    dbName = `test-db-v9-index-${Math.random().toString(36).slice(2)}`
    const database = new CatalogDb(dbName)
    await database.open()

    await database.channels.bulkAdd([
      {
        sourceId: 'src-1',
        generation: 1,
        kind: 'channel',
        name: 'Canal 7',
        originalName: 'Canal 7',
        groupOrder: 0,
        providerStreamId: '7',
      },
      {
        sourceId: 'src-1',
        generation: 1,
        kind: 'movie',
        name: 'Filme 7',
        originalName: 'Filme 7',
        groupOrder: 0,
        providerStreamId: '7',
      },
    ])

    const channel = await database.channels
      .where('[sourceId+generation+kind+providerStreamId]')
      .equals(['src-1', 1, 'channel', '7'])
      .toArray()
    expect(channel.map((r) => r.name)).toEqual(['Canal 7'])

    const movie = await database.channels
      .where('[sourceId+generation+kind+providerStreamId]')
      .equals(['src-1', 1, 'movie', '7'])
      .toArray()
    expect(movie.map((r) => r.name)).toEqual(['Filme 7'])

    database.close()
  })

  it('registro sem providerStreamId (fonte M3U) não entra no índice, sem quebrar a consulta', async () => {
    dbName = `test-db-v9-no-stream-id-${Math.random().toString(36).slice(2)}`
    const database = new CatalogDb(dbName)
    await database.open()

    await database.channels.add({
      sourceId: 'src-1',
      generation: 1,
      kind: 'movie',
      name: 'Filme M3U',
      originalName: 'Filme M3U',
      groupOrder: 0,
    })

    const results = await database.channels
      .where('[sourceId+generation+kind+providerStreamId]')
      .equals(['src-1', 1, 'movie', 'qualquer'])
      .toArray()
    expect(results).toEqual([])

    database.close()
  })
})

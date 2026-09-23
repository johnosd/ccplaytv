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

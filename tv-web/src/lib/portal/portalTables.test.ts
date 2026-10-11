import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { portalTables } from './portalTables'

const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })

it('migra v21 preservando fontes, favoritos e PINs sem criar arquivos M3U', async () => {
  const name = 'test-069-upgrade-' + crypto.randomUUID()
  names.push(name)
  const old = new Dexie(name)
  old.version(21).stores({
    sources: 'id', userStates: 'stableId, sourceId, favoritedAt, lastWatched',
    parentalPins: 'sourceId',
  })
  const source = { id: 'source-a', type: 'm3u_url', displayName: 'Lista existente',
    m3uUrl: 'https://provider.example.test/list.m3u', createdAt: 1, updatedAt: 1,
    connectionState: 'synced' }
  const favorite = { stableId: 'source-a|movie|id:7', sourceId: 'source-a', isFavorite: true,
    favoritedAt: 2, progressSeconds: 37, createdAt: 1, updatedAt: 2 }
  const pin = { sourceId: 'source-a', salt: 'fake-salt', hash: 'fake-hash', algorithm: 'sha256',
    createdAt: 1 }
  await old.table('sources').put(source)
  await old.table('userStates').put(favorite)
  await old.table('parentalPins').put(pin)
  old.close()
  const database = new CatalogDb(name)
  try {
    await database.open()
    expect(database.verno).toBe(22)
    expect(await database.sources.get('source-a')).toEqual(source)
    expect(await database.userStates.get(favorite.stableId)).toEqual(favorite)
    expect(await database.table('parentalPins').get('source-a')).toEqual(pin)
    expect(await portalTables(database).deletes.count()).toBe(0)
    expect(database.tables.map(table => table.name)).not.toContain('sourceFiles')
  } finally { database.close() }
})

it('persiste exclusões pendentes/revisões após reabrir e faz rollback conjunto', async () => {
  const name = 'test-069-outbox-' + crypto.randomUUID()
  names.push(name)
  let database = new CatalogDb(name)
  await database.open()
  let tables = portalTables(database)
  await database.transaction('rw', tables.deletes, tables.revisions, async () => {
    await tables.deletes.put({ deletionId: 'delete-a', sourceId: 'source-a', revision: 3,
      createdAt: 100 })
    await tables.revisions.put({ sourceId: 'source-a', revision: 3, tombstone: true, deletedAt: 100 })
  })
  database.close()
  database = new CatalogDb(name)
  await database.open()
  tables = portalTables(database)
  try {
    expect(await tables.deletes.get('delete-a')).toMatchObject({ revision: 3 })
    expect(await tables.revisions.get('source-a')).toMatchObject({ tombstone: true })
    await expect(database.transaction('rw', tables.deletes, tables.revisions, async () => {
      await tables.deletes.delete('delete-a')
      await tables.revisions.delete('source-a')
      throw Error('simulated interruption before commit')
    })).rejects.toThrow('simulated interruption')
    expect(await tables.deletes.count()).toBe(1)
    expect(await tables.revisions.get('source-a')).toMatchObject({ tombstone: true })
  } finally { database.close() }
})

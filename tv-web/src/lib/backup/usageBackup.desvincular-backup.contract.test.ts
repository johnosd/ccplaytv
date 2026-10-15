import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { categoryPreferences, parentalPins } from '../catalog/parentalTables'
import { buildUsageBackup } from './usageBackup'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

// FR-005 + SC-005 + Constitution (Segredos): o backup leva só dados de uso; nada de URL, credencial ou catálogo; a chave TMDB fica separada.
it('o backup leva favoritos, histórico, progresso, preferências, PIN e configurações, sem nenhuma URL ou credencial de lista', async () => {
  const db = new CatalogDb('test-072-backup-' + crypto.randomUUID())
  databases.push(db)
  await db.sources.put({ id: 'lista-1', type: 'm3u_url', displayName: 'Lista', m3uUrl: 'https://painel.fixture.test/get.php?password=senha-marcador-072',
    createdAt: 1, updatedAt: 1, connectionState: 'synced' } as never)
  await db.userStates.bulkPut([
    { stableId: 'lista-1:movie:1', sourceId: 'lista-1', isFavorite: true, favoritedAt: 5, createdAt: 5, updatedAt: 5 },
    { stableId: 'lista-1:movie:2', sourceId: 'lista-1', isFavorite: false, progressSeconds: 120, lastWatched: 6, createdAt: 6, updatedAt: 6 },
  ])
  await db.integrations.put({ id: 'tmdb', key: 'tmdb-marcador-072', format: 'v3', state: 'connected', lastTestedAt: 5 })
  await categoryPreferences(db).put({ sourceId: 'lista-1', kind: 'movie', matchKey: 'adultos', locked: true, updatedAt: 5 })
  await parentalPins(db).put({ sourceId: 'lista-1', salt: 'sal', hash: 'hash', algorithm: 'sha256', createdAt: 5 })

  const payload = await buildUsageBackup(db, { now: 1_000, settings: { 'ccplaytv:app-language': 'en' } })

  expect(payload.counts).toEqual({ favorites: 1, history: 1, progress: 1, categoryPreferences: 1, listPins: 1 })
  expect(payload.usage.settings).toEqual({ 'ccplaytv:app-language': 'en' })
  expect(payload.secrets.tmdb).toEqual({ key: 'tmdb-marcador-072', format: 'v3' })
  const usage = JSON.stringify(payload.usage)
  expect(usage).not.toContain('tmdb-marcador-072') // a chave só no bloco cifrado no serviço
  const all = JSON.stringify(payload)
  for (const forbidden of ['senha-marcador-072', 'painel.fixture.test', 'get.php', 'm3uUrl']) expect(all).not.toContain(forbidden)
})

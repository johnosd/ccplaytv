import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { backupTables, readBackupState } from './backupState'
import { PENDING_RESTORE_TTL_MS } from './usageMerge'
import { applyPendingRestores, deleteUsageBackup, restoreUsageBackup } from './usageRestore'
import type { UsageBackupPayload } from './usageBackupTypes'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
function database() { const db = new CatalogDb('test-072-restore-' + crypto.randomUUID()); databases.push(db); return db }
const source = (id: string) => ({ id, type: 'm3u_url', displayName: id, m3uUrl: 'https://fixture.test/' + id, createdAt: 1, updatedAt: 1, connectionState: 'synced' }) as never

function payload(): UsageBackupPayload {
  return { format: 1, createdAt: 500, counts: { favorites: 2, history: 0, progress: 0, categoryPreferences: 0, listPins: 1 },
    usage: {
      userStates: [
        { stableId: 'a:movie:1', sourceId: 'a', isFavorite: true, favoritedAt: 10, createdAt: 10, updatedAt: 10 },
        { stableId: 'b:movie:2', sourceId: 'b', isFavorite: true, favoritedAt: 20, createdAt: 20, updatedAt: 20 },
      ],
      categoryPreferences: [],
      listPins: [{ sourceId: 'b', salt: 's', hash: 'h', algorithm: 'sha256', createdAt: 5 }],
      settings: {},
    },
    secrets: { tmdb: { key: 'tmdb-do-backup', format: 'v3' } } }
}

it('restaura a lista presente, guarda a ausente, mantém a chave TMDB local e aplica a pendente quando a lista volta', async () => {
  const db = database()
  await db.sources.put(source('a'))
  await db.integrations.put({ id: 'tmdb', key: 'tmdb-local', format: 'v3', state: 'connected', lastTestedAt: 1 })
  const result = await restoreUsageBackup(db, payload(), 1_000)
  expect(result).toEqual({ applied: 1, pending: 1 })
  expect((await db.userStates.get('a:movie:1'))?.isFavorite).toBe(true)
  expect(await db.userStates.get('b:movie:2')).toBeUndefined()
  expect((await db.integrations.get('tmdb'))?.key).toBe('tmdb-local')
  expect((await readBackupState(db)).state).toBe('settled')

  await db.sources.put(source('b'))
  expect(await applyPendingRestores(db, 2_000)).toBe(2)
  expect((await db.userStates.get('b:movie:2'))?.isFavorite).toBe(true)
  expect(await db.table('parentalPins').get('b')).toBeTruthy()
  expect(await backupTables(db).pending.count()).toBe(0)
})

it('pendência vencida (5 dias) é descartada sem aplicar; apagar o backup limpa pendências e desliga o envio', async () => {
  const db = database()
  await restoreUsageBackup(db, payload(), 1_000)
  expect(await backupTables(db).pending.count()).toBe(2)
  await db.sources.put(source('a'))
  expect(await applyPendingRestores(db, 1_000 + PENDING_RESTORE_TTL_MS)).toBe(0)
  expect(await backupTables(db).pending.count()).toBe(0)
  expect(await db.userStates.count()).toBe(0)

  await restoreUsageBackup(db, payload(), 3_000)
  const request = vi.fn(async () => undefined)
  await deleteUsageBackup(db, { database: db, ready: async () => ({ bearer: 'tv.bearer' }), client: { request } } as never)
  expect(request).toHaveBeenCalledWith('/portal/v1/device/backup', expect.objectContaining({ method: 'DELETE' }))
  expect(await backupTables(db).pending.count()).toBe(0)
  expect((await readBackupState(db)).state).toBe('disabled')
})

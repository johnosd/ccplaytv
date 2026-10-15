import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { categoryPreferences, parentalPins } from '../catalog/parentalTables'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from './deviceIdentity'
import { portalTables } from './portalTables'
import { readRelinkHint, unlinkPortal } from './unlink'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

const credentials = { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
  deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
  recoveryCode: '0000-1111-2222-3333-4444-5555-6666', recoveryCodeVersion: 3 }

// US1/AC1, FR-002 (+ D-003): Desvincular apaga só o pareamento; catálogo, dados de uso, teste local e exclusões ficam.
it('desvincular solta identidade, licença em cache e fila de envios; preserva listas, uso, TMDB, PIN, teste e exclusões; guarda o código de recuperação', async () => {
  const db = new CatalogDb('test-072-unlink-' + crypto.randomUUID())
  databases.push(db)
  const tables = portalTables(db)
  await persistCredentialIssuance(db, credentials, 'enroll-a', 1)
  await acknowledgeCredentialIssuance(db, 'enroll-a', 1)
  await db.sources.put({ id: 'lista-1', type: 'm3u_url', displayName: 'Lista', m3uUrl: 'https://fixture.test/list', createdAt: 1, updatedAt: 1, connectionState: 'synced' } as never)
  await db.userStates.put({ stableId: 'lista-1:movie:42', sourceId: 'lista-1', isFavorite: true, favoritedAt: 5, createdAt: 5, updatedAt: 5 })
  await db.integrations.put({ id: 'tmdb', key: 'tmdb-fixture-key', format: 'v3', state: 'connected', lastTestedAt: 5 })
  await categoryPreferences(db).put({ sourceId: 'lista-1', kind: 'movie', matchKey: 'adultos', hidden: true, updatedAt: 5 })
  await parentalPins(db).put({ sourceId: 'lista-1', salt: 'sal', hash: 'hash', algorithm: 'sha256', createdAt: 5 })
  await tables.localTrial.put({ id: 'trial', startedAt: 100, highWatermark: 200 })
  await tables.license.put({ id: 'entitlement', deviceId: 'device-a', jws: 'fixture', generation: 1, timeHighWatermark: 1,
    signedServerTime: 1, lastSuccessfulSync: 1, nextDueAt: 1 })
  await tables.uploads.put({ sourceId: 'lista-1', uploadedRevision: 2 })
  await tables.deletes.put({ deletionId: 'del-1', sourceId: 'lista-velha', revision: 3, createdAt: 9 })

  await unlinkPortal(db, 1_000)

  expect(await tables.device.get('device')).toBeUndefined()
  expect(await tables.bootstrap.get('bootstrap')).toBeUndefined()
  expect(await tables.license.get('entitlement')).toBeUndefined()
  expect(await tables.uploads.count()).toBe(0)
  // Nada do que é da pessoa muda.
  expect(await db.sources.count()).toBe(1)
  expect((await db.userStates.get('lista-1:movie:42'))?.isFavorite).toBe(true)
  expect((await db.integrations.get('tmdb'))?.key).toBe('tmdb-fixture-key')
  expect(await categoryPreferences(db).count()).toBe(1)
  expect(await parentalPins(db).get('lista-1')).toBeTruthy()
  expect(await tables.localTrial.get('trial')).toMatchObject({ startedAt: 100 })
  expect(await tables.deletes.count()).toBe(1)
  // Só o necessário para voltar ao mesmo registro (D-002).
  expect(await readRelinkHint(db)).toMatchObject({ deviceId: 'device-a', recoveryCode: credentials.recoveryCode, recoveryCodeVersion: 3 })
})

import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from './deviceIdentity'
import { PortalRequestError } from './portalClient'
import { PortalConnection } from './portalConnection'
import { readRelinkHint, unlinkPortal } from './unlink'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

const CODE = '0000-1111-2222-3333-4444-5555-6666'
const credentials = { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
  deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: CODE, recoveryCodeVersion: 1 }

// US1/AC2, FR-004 + Constitution (Segredos): reparear volta ao MESMO registro com chave nova; o código só no corpo.
it('depois de desvincular, o cadastro recusado (recovery_required) é resolvido pela própria TV com o código guardado', async () => {
  const db = new CatalogDb('test-072-relink-' + crypto.randomUUID())
  databases.push(db)
  await persistCredentialIssuance(db, credentials, 'enroll-a', 1)
  await acknowledgeCredentialIssuance(db, 'enroll-a', 1)
  await unlinkPortal(db, 1_000)

  const reissued = { ...credentials, bearer: 'device-a.' + 'd'.repeat(42) + 'A', deviceKey: '9081726354', authEpoch: 2,
    recoveryCode: '7777-8888-9999-0000-1111-2222-3333', recoveryCodeVersion: 2, operationId: 'relink-a' }
  const request = vi.fn(async (path: string, options: { body?: Record<string, unknown> }) => {
    if (path.endsWith('/devices/enroll')) throw new PortalRequestError('recovery_required')
    if (path.endsWith('/devices/recovery/self')) {
      expect(options.body?.recoveryCode).toBe(CODE)
      expect(typeof options.body?.platformIdentity).toBe('string')
      return reissued
    }
    if (path.endsWith('/devices/recovery/ack')) return undefined
    throw new Error('rota inesperada: ' + path)
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')

  const device = await connection.ready()

  expect(device.deviceId).toBe('device-a')
  expect(device.displayId).toBe('A0:8C:FD:19:0A:8C')
  expect(device.deviceKey).toBe('9081726354')
  expect(request.mock.calls.some(([path]) => path.endsWith('/devices/recovery/self'))).toBe(true)
  expect(request.mock.calls.every(([path]) => !String(path).includes(CODE))).toBe(true)
  // O lembrete é consumido: o código antigo deixou de valer.
  expect(await readRelinkHint(db)).toBeUndefined()
})

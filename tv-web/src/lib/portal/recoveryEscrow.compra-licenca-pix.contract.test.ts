import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from './deviceIdentity'
import { PortalRequestError } from './portalClient'
import { portalTables } from './portalTables'
import { escrowRecoveryCode } from './recoveryEscrow'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

const credentials = { deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
  deviceKey: '1732049818', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
  recoveryCode: '0000-1111-2222-3333-4444-5555-6666', recoveryCodeVersion: 3 }

// FR-011, FR-012, D-008, Constitution: Segredos Fora dos Clientes e dos Logs (exceção (i)) + ADR-016 (só por ação):
// o código vai só no corpo, uma vez por versão; falha não marca como enviado; rotação faz enviar a versão nova.
it('envia o código de recuperação só no corpo, uma vez por versão, e reenvia só quando a versão muda', async () => {
  const db = new CatalogDb('test-073-escrow-' + crypto.randomUUID())
  databases.push(db)
  await persistCredentialIssuance(db, credentials, 'enroll-a', 1)
  await acknowledgeCredentialIssuance(db, 'enroll-a', 1)
  const request = vi.fn().mockRejectedValueOnce(new PortalRequestError('network_error')).mockResolvedValue(undefined)

  await expect(escrowRecoveryCode(db, { request })).rejects.toMatchObject({ code: 'network_error' })
  expect(await escrowRecoveryCode(db, { request })).toBe('sent')
  expect(request).toHaveBeenCalledTimes(2)
  const [path, init] = request.mock.calls[1]
  expect(path).toBe('/portal/v1/device/recovery-code/escrow')
  expect(init).toMatchObject({ method: 'PUT', bearer: credentials.bearer,
    body: { recoveryCode: credentials.recoveryCode, recoveryCodeVersion: 3 } })

  expect(await escrowRecoveryCode(db, { request })).toBe('skipped')
  expect(request).toHaveBeenCalledTimes(2)

  const rotated = '7777-8888-9999-AAAA-BBBB-CCCC-DDDD'
  await portalTables(db).device.update('device', { recoveryCode: rotated, recoveryCodeVersion: 4 })
  expect(await escrowRecoveryCode(db, { request })).toBe('sent')
  expect(request).toHaveBeenCalledTimes(3)
  expect(request.mock.calls[2][1]).toMatchObject({ body: { recoveryCode: rotated, recoveryCodeVersion: 4 } })
})

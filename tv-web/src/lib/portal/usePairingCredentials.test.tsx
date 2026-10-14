import Dexie from 'dexie'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import type { PortalConnection } from './portalConnection'
import { portalTables } from './portalTables'
import { usePairingCredentials } from './usePairingCredentials'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })

const device = (deviceKey: string) => ({ id: 'device' as const, deviceId: 'device-a', displayId: 'A0:8C:FD:19:0A:8C',
  bearer: 'device-a.' + 'a'.repeat(42) + 'A', deviceKey, authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
  recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1, nextSyncAt: 0 })

// Feature 071, FR-016: o QR fixo é derivado do registro local; "Gerar nova chave" muda o QR sem outra requisição
it('o QR acompanha a chave: nova chave troca o QR e a chave antiga não aparece mais', async () => {
  const database = new CatalogDb('test-071-qr-' + crypto.randomUUID()); databases.push(database)
  await portalTables(database).device.put(device('0123456789'))
  const connection = { database, origin: 'https://portal.test', ensurePairing: vi.fn(async () => device('0123456789')) } as unknown as PortalConnection
  const { result } = renderHook(() => usePairingCredentials(connection))

  await waitFor(() => expect(result.current.qrUrl).toBe('https://portal.test/#id=A0%3A8C%3AFD%3A19%3A0A%3A8C&key=0123456789'))
  expect(connection.ensurePairing).toHaveBeenCalledTimes(1)

  await portalTables(database).device.put(device('9876543210'))
  await waitFor(() => expect(result.current.qrUrl).toContain('key=9876543210'))
  expect(result.current.qrUrl).not.toContain('0123456789')
  // Cadastro/upgrade não se repete: a troca de chave é só leitura do registro local.
  expect(connection.ensurePairing).toHaveBeenCalledTimes(1)
})

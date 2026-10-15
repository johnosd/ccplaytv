import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { DeviceIdentityError, persistCredentialIssuance } from './deviceIdentity'
import { displayIdFromMac } from './displayId'
import { portalTables } from './portalTables'

const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
const base = { deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A', authEpoch: 1,
  recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }

// FR-003, edge case "MAC indisponível" — o fallback (ID gerado pelo servidor) depende de recusar MAC inútil
it('normaliza variantes de MAC para XX:XX:XX:XX:XX:XX e recusa ausente, inválido, zerado, broadcast e multicast', () => {
  for (const raw of ['a0:8c:fd:19:0a:8c', 'A0-8C-FD-19-0A-8C', 'a08cfd190a8c', ' A0:8C:FD:19:0A:8C ']) {
    expect(displayIdFromMac(raw)).toBe('A0:8C:FD:19:0A:8C')
  }
  for (const raw of [undefined, null, '', 'not-a-mac', 'A0:8C:FD:19:0A', '00:00:00:00:00:00', 'FF:FF:FF:FF:FF:FF', '01:00:5E:00:00:FB', 42]) {
    expect(displayIdFromMac(raw)).toBeUndefined()
  }
})

// FR-003, FR-004 — Constitution: Segredos (allowlist explícita na persistência; formato validado antes de exibir)
it('persiste ID exibido e chave numérica de 10 dígitos; recusa chave fora do formato e ID fora do padrão', async () => {
  const db = new CatalogDb('test-070-identity-' + crypto.randomUUID()); databases.push(db)
  await persistCredentialIssuance(db, { ...base, displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '1732049818' }, 'enrollment-a', Date.now())
  const saved = await portalTables(db).device.get('device')
  expect(saved?.displayId).toBe('A0:8C:FD:19:0A:8C')
  expect(saved?.deviceKey).toBe('1732049818')

  for (const invalid of [{ displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '173204981' }, { displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '17320A9818' },
    { displayId: 'a0-8c-fd-19-0a-8c', deviceKey: '1732049818' }]) {
    const other = new CatalogDb('test-070-identity-' + crypto.randomUUID()); databases.push(other)
    await expect(persistCredentialIssuance(other, { ...base, ...invalid }, 'enrollment-a', Date.now())).rejects.toBeInstanceOf(DeviceIdentityError)
  }
})

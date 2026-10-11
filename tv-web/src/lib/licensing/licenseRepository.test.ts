import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { portalTables } from '../portal/portalTables'
import { checkpointLicenseClock, loadLicense, storeLicense } from './licenseRepository'
import type { LicenseAuthority } from './verifyEntitlement'
const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
async function fixture() {
  const database = new CatalogDb('test-069-license-' + crypto.randomUUID()); databases.push(database)
  await portalTables(database).device.put({ id: 'device', deviceId: 'fixture', bearer: 'private', deviceKey: 'private', authEpoch: 1, recoveryEpoch: 'fixture-epoch', recoveryCode: 'private', recoveryCodeVersion: 1, nextSyncAt: 0 })
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
  const authority: LicenseAuthority = { deviceId: 'fixture', issuer: 'ccplaytv-portal', audience: 'ccplaytv', minimumGeneration: 0, keys: { current: jwk } }
  const now = Date.now()
  const encode = (value: string | Uint8Array) => btoa(typeof value === 'string' ? value : String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
  async function sign(generation: number, change: Record<string, unknown> = {}) {
    const claims = { iss: authority.issuer, aud: authority.audience, deviceId: 'fixture', startsAt: now - 1000, expiresAt: now + 100000, serverTime: now, state: 'active', generation, ...change }
    const input = encode(canonical({ alg: 'ES256', kid: 'current', typ: 'JWT' })) + '.' + encode(canonical(claims))
    return input + '.' + encode(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(input))))
  }
  return { database, authority, now, sign }
}
it('cache offline sobrevive reinício e entrada inválida não substitui licença vigente', async () => {
  const { database, authority, now, sign } = await fixture()
  const jws = await sign(2)
  await storeLicense(database, jws, authority, now)
  await expect(storeLicense(database, 'invalid', authority, now)).rejects.toThrow('invalid_entitlement')
  database.close()
  await database.open()
  const loaded = await loadLicense(database, authority)
  expect(loaded?.entitlement.generation).toBe(2)
  expect(loaded?.record.jws).toBe(jws)
  expect(await database.sources.count()).toBe(0)
  await expect(storeLicense(database, await sign(1), authority, now)).rejects.toThrow('invalid_entitlement')
  await expect(storeLicense(database, await sign(2, { state: 'revoked' }), authority, now)).rejects.toThrow('invalid_entitlement')
  await expect(storeLicense(database, await sign(3, { deviceId: 'other' }), authority, now)).rejects.toThrow('invalid_entitlement')
  expect((await loadLicense(database, authority))?.record.jws).toBe(jws)
})
it('concessões concorrentes não retrocedem e checkpoint antigo não sobrescreve geração nova', async () => {
  const { database, authority, now, sign } = await fixture()
  const [second, third] = await Promise.all([sign(2), sign(3)])
  await Promise.allSettled([storeLicense(database, second, authority, now), storeLicense(database, third, authority, now)])
  expect((await loadLicense(database, authority))?.entitlement.generation).toBe(3)
  expect(await checkpointLicenseClock(database, 'fixture', 2, { timeHighWatermark: now + 10000, signedServerTime: now })).toBe(false)
  expect(await checkpointLicenseClock(database, 'fixture', 3, { timeHighWatermark: now + 5000, signedServerTime: now + 999999 })).toBe(true)
  await checkpointLicenseClock(database, 'fixture', 3, { timeHighWatermark: now, signedServerTime: now })
  const saved = (await loadLicense(database, authority))!.record
  expect(saved.timeHighWatermark).toBe(now + 5000)
  expect(saved.signedServerTime).toBe(now)
})

import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { acknowledgeCredentialIssuance, enrollmentNonce, persistCredentialIssuance,
  prepareCredentialRotation, prepareRecoveryChallenge, persistRecoveryChallenge, readPlatformIdentity, type CredentialIssuance } from './deviceIdentity'
import { portalTables } from './portalTables'

const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })
function database() {
  const name = 'test-069-identity-' + crypto.randomUUID()
  names.push(name)
  return new CatalogDb(name)
}
const credentials: CredentialIssuance = {
  deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
  deviceKey: 'b'.repeat(42) + 'A', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
  recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1,
}

it('persiste nonce antes da rede e reutiliza após reabrir, sem gravar DUID', async () => {
  let db = database()
  const nonce = await enrollmentNonce(db, crypto, 100)
  expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
  const name = db.name
  db.close()
  db = new CatalogDb(name)
  try {
    expect(await enrollmentNonce(db, crypto, 200)).toBe(nonce)
    expect(await portalTables(db).bootstrap.get('bootstrap')).toEqual({
      id: 'bootstrap', enrollmentNonce: nonce, createdAt: 100,
    })
    expect(readPlatformIdentity(() => 'fixture-platform-duid')).toBe('fixture-platform-duid')
    for (const getDuid of [() => '', () => '  ', () => 123 as unknown as string,
      () => { throw Error('private-platform-error') }]) {
      expect(() => readPlatformIdentity(getDuid)).toThrow('invalid_device_identity')
    }
  } finally { db.close() }
})

it('grava credenciais e pendência de ACK juntas, preservando catálogo e ACK posterior', async () => {
  const db = database()
  try {
    await db.sources.put({ id: 'source-existing', type: 'm3u_url', displayName: 'Existente',
      m3uUrl: 'https://provider.example.test/list', createdAt: 1, updatedAt: 1,
      connectionState: 'synced' })
    await enrollmentNonce(db, crypto, 100)
    await persistCredentialIssuance(db, credentials, 'issuance-a', 200)
    const tables = portalTables(db)
    expect(await tables.device.get('device')).toMatchObject(credentials)
    expect(await tables.bootstrap.get('bootstrap')).toEqual({
      id: 'bootstrap', createdAt: 200, pendingAck: { operationId: 'issuance-a', authEpoch: 1, createdAt: 200 },
    })
    expect(await db.sources.count()).toBe(1)
    await expect(enrollmentNonce(db, crypto, 201)).rejects.toThrow('invalid_device_identity')
    await persistCredentialIssuance(db, { ...credentials, authEpoch: 2,
      bearer: 'device-a.' + 'd'.repeat(42) + 'A', deviceKey: 'e'.repeat(42) + 'A',
      recoveryCodeVersion: 2 }, 'issuance-b', 300)
    expect(await acknowledgeCredentialIssuance(db, 'issuance-a', 1)).toBe(false)
    expect((await tables.bootstrap.get('bootstrap'))?.pendingAck?.operationId).toBe('issuance-b')
    expect(await acknowledgeCredentialIssuance(db, 'issuance-b', 2)).toBe(true)
    expect(await tables.bootstrap.get('bootstrap')).toBeUndefined()
    expect(await tables.device.get('device')).toMatchObject({ authEpoch: 2 })
    expect(await db.sources.count()).toBe(1)
  } finally { db.close() }
})

it('recusa troca de TV, rollback e resposta malformada sem alterar credenciais', async () => {
  const db = database()
  try {
    await persistCredentialIssuance(db, credentials, 'issuance-a', 100)
    for (const invalid of [
      { ...credentials, deviceId: 'device-b', bearer: 'device-b.' + 'a'.repeat(42) + 'A' },
      { ...credentials, authEpoch: 0 }, { ...credentials, deviceKey: 'invalid' },
      { ...credentials, recoveryCodeVersion: 0 },
      { ...credentials, bearer: undefined } as unknown as CredentialIssuance,
    ]) {
      await expect(persistCredentialIssuance(db, invalid, 'issuance-b', 200))
        .rejects.toThrow('invalid_device_identity')
    }
    expect(await portalTables(db).device.get('device')).toMatchObject(credentials)
    expect((await portalTables(db).bootstrap.get('bootstrap'))?.pendingAck?.operationId).toBe('issuance-a')
  } finally { db.close() }
})

it('persiste prova da rotação antes da rede e ACK antigo não remove emissão nova da mesma operação', async () => {
  const db = database()
  try {
    await persistCredentialIssuance(db, credentials, 'issuance-a', 100)
    await acknowledgeCredentialIssuance(db, 'issuance-a', 1)
    const pending = await prepareCredentialRotation(db, crypto, 'revoke', 200)
    expect(await prepareCredentialRotation(db, crypto, 'revoke', 201)).toEqual(pending)
    await expect(prepareCredentialRotation(db, crypto, 'rotate', 201)).rejects.toThrow('invalid_device_identity')
    const changed = { ...credentials, authEpoch: 2, recoveryCodeVersion: 2,
      bearer: 'device-a.' + 'd'.repeat(42) + 'A', deviceKey: 'e'.repeat(42) + 'A' }
    await persistCredentialIssuance(db, changed, pending.operationId, 300)
    await persistCredentialIssuance(db, { ...changed, authEpoch: 3, recoveryCodeVersion: 3,
      bearer: 'device-a.' + 'f'.repeat(42) + 'A', deviceKey: 'g'.repeat(42) + 'A' }, pending.operationId, 400)
    expect(await acknowledgeCredentialIssuance(db, pending.operationId, 2)).toBe(false)
    expect((await portalTables(db).bootstrap.get('bootstrap'))?.pendingAck?.authEpoch).toBe(3)
    expect(await acknowledgeCredentialIssuance(db, pending.operationId, 3)).toBe(true)
  } finally { db.close() }
})


it('grava desafio antes do QR, conserva prova após reabrir e rejeita resposta antiga ou de outra TV', async () => {
  let db = database()
  try {
    await persistCredentialIssuance(db, credentials, 'enroll-a', 100)
    await acknowledgeCredentialIssuance(db, 'enroll-a', 1)
    const nonce = await prepareRecoveryChallenge(db, crypto, 1_000)
    const challenge = { claimId: 'claim-fixture', deviceId: credentials.deviceId,
      token: 'h'.repeat(42) + 'A', claimSecret: 'i'.repeat(42) + 'A',
      expiresAt: new Date(301_000).toISOString() }
    await persistRecoveryChallenge(db, nonce, challenge, 1_001)
    const name = db.name
    db.close()
    db = new CatalogDb(name)
    expect(await prepareRecoveryChallenge(db, crypto, 2_000)).toBe(nonce)
    expect((await portalTables(db).bootstrap.get('bootstrap'))?.pendingRecovery)
      .toMatchObject({ claimId: challenge.claimId, claimSecret: challenge.claimSecret })
    await expect(persistRecoveryChallenge(db, nonce, { ...challenge, deviceId: 'device-b' }, 2_000))
      .rejects.toThrow('invalid_device_identity')
    const next = await prepareRecoveryChallenge(db, crypto, 301_000)
    expect(next).not.toBe(nonce)
    await expect(persistRecoveryChallenge(db, nonce, { ...challenge,
      expiresAt: new Date(600_000).toISOString() }, 302_000)).rejects.toThrow('invalid_device_identity')
    expect(await portalTables(db).device.get('device')).toMatchObject(credentials)
    await persistCredentialIssuance(db, { ...credentials, authEpoch: 2, recoveryCodeVersion: 2,
      bearer: 'device-a.' + 'j'.repeat(42) + 'A', deviceKey: 'k'.repeat(42) + 'A' }, 'recover-a', 303_000)
    expect((await portalTables(db).bootstrap.get('bootstrap'))?.pendingRecovery).toBeUndefined()
    await expect(prepareRecoveryChallenge(db, crypto, 304_000)).rejects.toThrow('invalid_device_identity')
  } finally { db.close() }
})

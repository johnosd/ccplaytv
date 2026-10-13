import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { PortalConnection } from './portalConnection'
import { PortalRequestError } from './portalClient'
import { acknowledgeCredentialIssuance, persistCredentialIssuance, prepareCredentialRotation } from './deviceIdentity'
import { portalTables } from './portalTables'
const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
function database() { const db = new CatalogDb('test-069-connection-' + crypto.randomUUID()); databases.push(db); return db }
const credentials = { deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
  deviceKey: 'b'.repeat(42) + 'A', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
  recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
it('cadastro concorrente compartilha nonce/rede e perda de ACK não recadastra nem remove listas', async () => {
  const db = database()
  await db.sources.put({ id: 'existing', type: 'm3u_url', displayName: 'Existente', m3uUrl: 'https://fixture.test/list', createdAt: 1, updatedAt: 1, connectionState: 'synced' })
  let failAck = true
  const request = vi.fn(async (path: string) => {
    if (path.endsWith('/enroll')) {
      expect((await portalTables(db).bootstrap.get('bootstrap'))?.enrollmentNonce).toBeTruthy()
      return { ...credentials, operationId: 'enrollment-a' }
    }
    expect((await portalTables(db).bootstrap.get('bootstrap'))?.pendingAck).toBeTruthy()
    if (failAck) throw new PortalRequestError()
    return undefined
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  const first = connection.ready()
  expect(connection.ready()).toBe(first)
  await expect(first).rejects.toThrow('network_error')
  failAck = false
  await connection.ready()
  expect(request.mock.calls.filter(([p]) => p.endsWith('/enroll'))).toHaveLength(1)
  expect(await portalTables(db).bootstrap.get('bootstrap')).toBeUndefined()
  expect(await db.sources.count()).toBe(1)
})
it('rotação retomada após bearer revogado usa prova durável e confirma nova emissão', async () => {
  const db = database()
  await persistCredentialIssuance(db, credentials, 'enrollment-a', 1)
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const pending = await prepareCredentialRotation(db, crypto, 'revoke', 2)
  const request = vi.fn(async (path: string, options: { bearer?: string }) => {
    if (path.endsWith('/revoke')) throw new PortalRequestError('unauthorized')
    if (path.endsWith('/result')) {
      expect(options.bearer).toBe(pending.claimSecret)
      return { operationId: pending.operationId, state: 'ready', credentials: { ...credentials,
        authEpoch: 2, recoveryCodeVersion: 2, bearer: 'device-a.' + 'd'.repeat(42) + 'A' } }
    }
    expect(options.bearer).toBe('device-a.' + 'd'.repeat(42) + 'A')
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  expect((await connection.rotate('revoke')).authEpoch).toBe(2)
  expect(request).toHaveBeenCalledTimes(3)
  expect(await portalTables(db).bootstrap.get('bootstrap')).toBeUndefined()
})
it('QR aceita somente imagem PNG local e prazo curto; nenhum URI remoto é renderizável', async () => {
  const db = database()
  await persistCredentialIssuance(db, credentials, 'enrollment-a', 1)
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const valid = { token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' }
  let response = valid
  const request = vi.fn(async () => response)
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  expect((await connection.invite()).deviceId).toBe('device-a')
  for (const invalid of [{ ...valid, qrDataUrl: 'https://third-party.test/qr' }, { ...valid, expiresAt: 'não-é-uma-data' }, { ...valid, token: 'invalid' }]) {
    response = invalid
    await expect(connection.invite()).rejects.toThrow('service_unavailable')
  }
})

it('prazo do convite é ancorado no relógio da TV: servidor adiantado, atrasado ou absurdo não invalida um convite válido', async () => {
  // Achado na TV/staging: o servidor emite exatamente 300 s e a TV rejeitava `expiresAt > agora + 300 s`;
  // qualquer relógio local atrasado ≥ 1 s em relação ao servidor tornava o QR impossível.
  const db = database()
  await persistCredentialIssuance(db, credentials, 'enrollment-a', 1)
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const base = { token: 'a'.repeat(43), qrDataUrl: 'data:image/png;base64,aGVsbG8=' }
  let response: Record<string, string> = {}
  const connection = new PortalConnection(db, { request: (async () => response) as never }, 'https://portal.test', () => 'fixture-duid')
  for (const serverClockOffsetMs of [1_000, 5 * 60_000, 3_600_000, -3_600_000, -86_400_000]) {
    response = { ...base, expiresAt: new Date(Date.now() + 300_000 + serverClockOffsetMs).toISOString() }
    const { invite } = await connection.invite()
    const remaining = Date.parse(invite.expiresAt) - Date.now()
    expect(remaining, `offset ${serverClockOffsetMs}`).toBeGreaterThan(290_000)
    expect(remaining, `offset ${serverClockOffsetMs}`).toBeLessThanOrEqual(300_000)
  }
})

it('desafio de recuperação com relógio do servidor adiantado persiste com prazo local de até 5 min', async () => {
  const db = database()
  const challenge = { claimId: 'claim-fixture', deviceId: 'device-a', token: 'a'.repeat(42) + 'A', claimSecret: 'b'.repeat(42) + 'A',
    expiresAt: new Date(Date.now() + 301_000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' }
  const connection = new PortalConnection(db, { request: (async () => challenge) as never }, 'https://portal.test', () => 'fixture-duid')
  const { invite } = await connection.recovery()
  const remaining = Date.parse(invite.expiresAt) - Date.now()
  expect(remaining).toBeGreaterThan(290_000)
  expect(remaining).toBeLessThanOrEqual(300_000)
  const saved = (await portalTables(db).bootstrap.get('bootstrap'))?.pendingRecovery
  expect(saved?.expiresAt).toBe(Date.parse(invite.expiresAt))
})

it('070: cadastro envia o MAC normalizado; getMac ausente, inútil ou lançando não impede o cadastro nem envia mac', async () => {
  for (const [getMac, expected] of [
    [() => 'a0-8c-fd-19-0a-8c', 'A0:8C:FD:19:0A:8C'], [() => '00:00:00:00:00:00', undefined],
    [() => { throw Error('fake-private') }, undefined], [undefined, undefined],
  ] as [(() => string) | undefined, string | undefined][]) {
    const db = database()
    const bodies: Record<string, unknown>[] = []
    const request = vi.fn(async (path: string, options: { body?: Record<string, unknown> }) => {
      if (path.endsWith('/enroll')) { bodies.push(options.body!); return { ...credentials, displayId: '02:00:00:00:00:01', deviceKey: '1732049818', operationId: 'enrollment-a' } }
      return undefined
    })
    const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid', getMac)
    const device = await connection.ready()
    expect(bodies[0].mac).toBe(expected)
    expect(device.displayId).toBe('02:00:00:00:00:01')
    expect(JSON.stringify(bodies[0])).not.toContain('fake-private')
  }
})

it('070/D-004: registro anterior à 070 ganha ID e chave numérica por UMA rotação revoke; registro novo não rotaciona', async () => {
  const db = database()
  await persistCredentialIssuance(db, credentials, 'enrollment-a', 1)
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const paths: string[] = []
  const request = vi.fn(async (path: string, options: { body?: Record<string, unknown> }) => {
    paths.push(path)
    if (path.endsWith('/revoke')) { expect(options.body?.mac).toBe('A0:8C:FD:19:0A:8C'); return { state: 'ready' } }
    if (path.endsWith('/result')) {
      const pending = (await portalTables(db).bootstrap.get('bootstrap'))!.pendingRotation!
      return { operationId: pending.operationId, state: 'ready', credentials: { ...credentials, displayId: 'A0:8C:FD:19:0A:8C',
        deviceKey: '1732049818', authEpoch: 2, recoveryCodeVersion: 2, bearer: 'device-a.' + 'd'.repeat(42) + 'A' } }
    }
    return undefined
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid', () => 'a0:8c:fd:19:0a:8c')
  const upgraded = await connection.ensurePairing()
  expect(upgraded.displayId).toBe('A0:8C:FD:19:0A:8C')
  expect(upgraded.deviceKey).toBe('1732049818')
  expect(paths.filter(path => path.endsWith('/revoke'))).toHaveLength(1)
  paths.length = 0
  expect((await connection.ensurePairing()).deviceKey).toBe('1732049818')
  expect(paths.filter(path => path.endsWith('/revoke'))).toHaveLength(0)
})

it('recuperação persiste prova antes do QR e retoma ACK perdido sem recadastrar/apagar fontes', async () => {
  const db = database()
  await db.sources.put({ id: 'existing', type: 'm3u_url', displayName: 'Existente', m3uUrl: 'https://fixture.test/list', createdAt: 1, updatedAt: 1, connectionState: 'synced' })
  const challenge = { claimId: 'claim-fixture', deviceId: 'device-a', token: 'a'.repeat(42) + 'A', claimSecret: 'b'.repeat(42) + 'A', expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' }
  let failAck = true
  const request = vi.fn(async (path: string, options: { bearer?: string }) => {
    if (path.endsWith('/challenges')) {
      expect((await portalTables(db).bootstrap.get('bootstrap'))?.recoveryRequest?.nonce).toBeTruthy()
      return challenge
    }
    if (path.endsWith('/result')) {
      expect(options.bearer).toBe(challenge.claimSecret)
      return { operationId: 'recovery-operation', state: 'ready', credentials }
    }
    expect(path).toBe('/portal/v1/devices/recovery/ack')
    expect((await portalTables(db).bootstrap.get('bootstrap'))?.pendingAck?.purpose).toBe('recovery')
    if (failAck) throw new PortalRequestError()
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  await connection.recovery()
  expect((await portalTables(db).bootstrap.get('bootstrap'))?.pendingRecovery?.claimSecret).toBe(challenge.claimSecret)
  await expect(connection.pollRecovery(new AbortController().signal)).rejects.toThrow('network_error')
  failAck = false
  const restarted = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  expect(await restarted.pollRecovery(new AbortController().signal)).toBe('ready')
  expect(request.mock.calls.filter(([path]) => path.endsWith('/result'))).toHaveLength(1)
  expect(await portalTables(db).bootstrap.get('bootstrap')).toBeUndefined()
  expect(await db.sources.count()).toBe(1)
})
it('resposta de recuperação para outra TV e resultado abortado não persistem credenciais', async () => {
  const db = database()
  const challenge = { claimId: 'claim-fixture', deviceId: 'device-a', token: 'a'.repeat(42) + 'A', claimSecret: 'b'.repeat(42) + 'A', expiresAt: new Date(Date.now() + 299000).toISOString(), qrDataUrl: 'data:image/png;base64,aGVsbG8=' }
  const controller = new AbortController()
  let wrongDevice = true
  const request = vi.fn(async (path: string) => {
    if (path.endsWith('/challenges')) return challenge
    if (!wrongDevice) controller.abort()
    return { operationId: 'recovery-operation', state: 'ready', credentials: { ...credentials, deviceId: wrongDevice ? 'other' : credentials.deviceId } }
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  await connection.recovery()
  await expect(connection.pollRecovery(controller.signal)).rejects.toThrow('service_unavailable')
  wrongDevice = false
  await expect(connection.pollRecovery(controller.signal)).rejects.toThrow()
  expect(await portalTables(db).device.get('device')).toBeUndefined()
  expect((await portalTables(db).bootstrap.get('bootstrap'))?.pendingRecovery).toBeTruthy()
})

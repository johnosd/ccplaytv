import Dexie from 'dexie'
import { waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { portalTables } from '../portal/portalTables'
import { createLicenseMonitor } from './licenseMonitor'
import { checkpointLicenseClock, loadLicense } from './licenseRepository'
import { TrustedClock } from './trustedClock'
vi.mock('./licenseRepository', () => ({ loadLicense: vi.fn(), checkpointLicenseClock: vi.fn(async () => true) }))
const databases: CatalogDb[] = []
afterEach(async () => { vi.useRealTimers(); vi.clearAllMocks(); for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
it('monitor compartilhado usa só relógio/cache, checkpoint no pagehide e vencimento ao retornar', async () => {
  const database = new CatalogDb('test-069-monitor-' + crypto.randomUUID()); databases.push(database)
  const tables = portalTables(database)
  await tables.device.put({ id: 'device', deviceId: 'fixture', bearer: 'private', deviceKey: 'private', authEpoch: 1, recoveryEpoch: 'fixture', recoveryCode: 'private', recoveryCodeVersion: 1, nextSyncAt: 0 })
  const record = { id: 'entitlement' as const, deviceId: 'fixture', jws: 'fixture-jws', generation: 1, timeHighWatermark: 1000, signedServerTime: 1000, lastSuccessfulSync: 1000, nextDueAt: 0 }
  await tables.license.put(record)
  let wall = 1000, mono = 0
  const entitlement = { deviceId: 'fixture', startsAt: 1000, expiresAt: 5000, state: 'active' as const, generation: 1, serverTime: 1000, kid: 'fixture' }
  vi.mocked(loadLicense).mockResolvedValue({ record, entitlement, clock: new TrustedClock(record, () => wall, () => mono) })
  const monitor = createLicenseMonitor(database, deviceId => ({ deviceId, issuer: 'fixture', audience: 'fixture', keys: {}, minimumGeneration: 0 }))
  const first = monitor.start(), second = monitor.start()
  await waitFor(() => expect(monitor.getSnapshot().decision.allowed).toBe(true))
  expect(loadLicense).toHaveBeenCalledOnce()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  window.dispatchEvent(new Event('pagehide'))
  expect(checkpointLicenseClock).toHaveBeenCalled()
  wall = 10000; mono = 9000
  await vi.advanceTimersByTimeAsync(10000)
  expect(monitor.getSnapshot().decision.allowed).toBe(true)
  window.dispatchEvent(new Event('pageshow'))
  expect(monitor.getSnapshot().decision).toEqual({ allowed: false, reason: 'expired' })
  first()
  const calls = vi.mocked(checkpointLicenseClock).mock.calls.length
  await vi.advanceTimersByTimeAsync(30000)
  expect(vi.mocked(checkpointLicenseClock).mock.calls.length).toBeGreaterThanOrEqual(calls)
  second()
  expect(monitor.check()).toEqual({ allowed: false, reason: 'not_activated' })
  const stoppedCalls = vi.mocked(checkpointLicenseClock).mock.calls.length
  wall += 60000; mono += 60000
  await vi.advanceTimersByTimeAsync(60000)
  expect(vi.mocked(checkpointLicenseClock).mock.calls.length).toBe(stoppedCalls)
})

it('071: teste local libera sem licença; licença assinada revogada vence o teste', async () => {
  const database = new CatalogDb('test-071-monitor-' + crypto.randomUUID()); databases.push(database)
  const tables = portalTables(database)
  await tables.device.put({ id: 'device', deviceId: 'fixture', bearer: 'private', deviceKey: 'private', authEpoch: 1, recoveryEpoch: 'fixture', recoveryCode: 'private', recoveryCodeVersion: 1, nextSyncAt: 0 })
  await tables.localTrial.put({ id: 'trial', startedAt: Date.now(), highWatermark: Date.now() })
  const monitor = createLicenseMonitor(database, deviceId => ({ deviceId, issuer: 'fixture', audience: 'fixture', keys: {}, minimumGeneration: 0 }))
  const stop = monitor.start()
  await waitFor(() => expect(monitor.getSnapshot().decision).toEqual({ allowed: true, reason: 'valid' }))
  expect(monitor.getSnapshot().state).toBe('trial')
  const record = { id: 'entitlement' as const, deviceId: 'fixture', jws: 'revoked-jws', generation: 2, timeHighWatermark: 1000, signedServerTime: 1000, lastSuccessfulSync: 1000, nextDueAt: 0 }
  const entitlement = { deviceId: 'fixture', startsAt: 1000, expiresAt: Date.now() + 86_400_000, state: 'revoked' as const, generation: 2, serverTime: 1000, kid: 'fixture' }
  vi.mocked(loadLicense).mockResolvedValue({ record, entitlement, clock: new TrustedClock(record) })
  await tables.license.put(record)
  await waitFor(() => expect(monitor.getSnapshot().decision).toEqual({ allowed: false, reason: 'revoked' }))
  stop()
})

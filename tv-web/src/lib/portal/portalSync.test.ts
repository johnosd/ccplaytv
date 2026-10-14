import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { createSource, updateSource, deleteSource } from '../catalog/sourceRepository'
import { PortalConnection } from './portalConnection'
import { createPortalSync } from './portalSync'
import { portalTables } from './portalTables'
import { persistCredentialIssuance, acknowledgeCredentialIssuance } from './deviceIdentity'
const databases: CatalogDb[] = []
afterEach(async () => { for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) } })
async function fixture() {
  const db = new CatalogDb('test-069-sync-' + crypto.randomUUID()); databases.push(db)
  const credentials = { deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A',
    deviceKey: 'b'.repeat(42) + 'A', authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A',
    recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  await persistCredentialIssuance(db, credentials, 'enrollment-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  let deliveries: unknown[] = []
  let loseAck = false
  let deleteAck = true
  const calls: { path: string; body: any }[] = []
  const request = vi.fn(async (path: string, options: { body?: unknown }) => {
    calls.push({ path, body: options.body })
    if (path.endsWith('/deletions')) return { acks: deleteAck ? (options.body as any).deletions.map((x: any) => x.deletionId) : [] }
    if (path.endsWith('/operations')) return { operations: deliveries }
    if (path.endsWith('/ack') && loseAck) throw new Error('simulated response lost')
    return {}
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  const importSource = vi.fn(async () => {})
  const committed = vi.fn(async () => {})
  const confirmDestructive = vi.fn(async () => true)
  let active: string | undefined
  const ports = createPortalSync({ database: db, connection, importSource, committed, confirmDestructive, activeSourceId: () => active })
  const signal = new AbortController().signal
  const delivery = (overrides = {}) => ({ operationId: 'operation-a', deviceId: 'device-a', authEpoch: 1,
    sourceId: 'source-a', expectedRevision: 0, action: 'source.create', expiresAt: new Date(Date.now() + 60000).toISOString(),
    input: { type: 'm3u_url', displayName: 'Lista', m3uUrl: 'https://provider.invalid/list?key=fake-secret' }, ...overrides })
  return { db, calls, request, ports, signal, delivery, importSource, committed, confirmDestructive,
    deliveries: (values: unknown[]) => { deliveries = values }, lostAck: (value: boolean) => { loseAck = value },
    deletionAck: (value: boolean) => { deleteAck = value }, active: (value: string) => { active = value } }
}
it('ACK perdido reapresenta recibo sem duplicar importação; snapshot não vaza URL', async () => {
  const f = await fixture(); const row = f.delivery(); f.deliveries([row]); f.lostAck(true)
  await expect(f.ports.pull(f.signal)).rejects.toThrow()
  expect(await f.db.sources.count()).toBe(1)
  f.lostAck(false)
  await f.ports.pull(f.signal)
  expect(f.importSource).toHaveBeenCalledTimes(1)
  await f.ports.publishSnapshot(f.signal)
  const body = f.calls.find(x => x.path.endsWith('/snapshot'))!.body
  expect(JSON.stringify(body)).not.toContain('fake-secret')
  expect(Object.keys(body.sources[0]).sort()).toEqual(['connectionState', 'displayName', 'id', 'type', 'updatedAt'])
})
it('exclusão offline conserva outbox até ACK correspondente e nunca recria fonte', async () => {
  const f = await fixture()
  await createSource({ type: 'm3u_url', displayName: 'Lista', m3uUrl: 'https://fixture.test/list' }, f.db, { sourceId: 'source-a' })
  await deleteSource('source-a', f.db)
  f.deletionAck(false)
  await expect(f.ports.flushDeletions(f.signal)).rejects.toThrow('service_unavailable')
  expect(await portalTables(f.db).deletes.count()).toBe(1)
  f.deletionAck(true)
  await f.ports.flushDeletions(f.signal)
  expect(await portalTables(f.db).deletes.count()).toBe(0)
  f.deliveries([f.delivery()])
  await f.ports.pull(f.signal)
  expect(await f.db.sources.count()).toBe(0)
  expect(f.importSource).not.toHaveBeenCalled()
  expect(f.calls.at(-1)?.body.state).toBe('conflict')
})
it('confirmação cancelada não grava recibo; edição concorrente conflita após confirmação', async () => {
  const f = await fixture()
  await createSource({ type: 'm3u_url', displayName: 'Lista', m3uUrl: 'https://fixture.test/list' }, f.db, { sourceId: 'source-a' })
  f.active('source-a')
  f.deliveries([f.delivery({ action: 'source.update', expectedRevision: 1, input: { displayName: 'Remoto' } })])
  f.confirmDestructive.mockResolvedValueOnce(false)
  await f.ports.pull(f.signal)
  expect(await portalTables(f.db).operations.count()).toBe(0)
  expect(f.calls.at(-1)?.body.state).toBe('awaiting_confirmation')
  f.confirmDestructive.mockImplementationOnce(async () => { await updateSource('source-a', { displayName: 'Local' }, f.db); return true })
  await f.ports.pull(f.signal)
  expect(f.calls.at(-1)?.body.state).toBe('conflict')
  expect((await f.db.sources.get('source-a'))?.displayName).toBe('Local')
})
it('lote com destino/epoch/prazo inválido é recusado antes de criar qualquer lista', async () => {
  for (const overrides of [{ deviceId: 'other' }, { authEpoch: 2 }, { expiresAt: new Date(1).toISOString() }]) {
    const f = await fixture(); f.deliveries([f.delivery(), f.delivery({ ...overrides, operationId: 'bad' })])
    await expect(f.ports.pull(f.signal)).rejects.toThrow()
    expect(await f.db.sources.count()).toBe(0)
  }
})
it('revogação enquanto confirmação está aberta impede commit com autoridade antiga', async () => {
  const f = await fixture()
  await createSource({ type: 'm3u_url', displayName: 'Lista', m3uUrl: 'https://fixture.test/list' }, f.db, { sourceId: 'source-a' })
  f.active('source-a')
  f.deliveries([f.delivery({ action: 'source.update', expectedRevision: 1, input: { displayName: 'Remoto' } })])
  f.confirmDestructive.mockImplementationOnce(async () => { await portalTables(f.db).device.update('device', { authEpoch: 2 }); return true })
  await expect(f.ports.pull(f.signal)).rejects.toThrow('unauthorized')
  expect((await f.db.sources.get('source-a'))?.displayName).toBe('Lista')
  expect(await portalTables(f.db).operations.count()).toBe(0)
})

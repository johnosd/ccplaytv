import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { getTmdbStatus } from '../metadata/tmdbKeyRepository'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from './deviceIdentity'
import { PortalConnection } from './portalConnection'
import { PortalRequestError } from './portalClient'
import { capturePortalSnapshot } from './snapshotPublisher'
import { createTmdbRemoteStep } from './tmdbRemote'

// Feature 077 (ADR-020): adaptador HTTP do passo `integrations` e o campo `integrations.tmdb` do snapshot. A chave de
// teste nunca pode aparecer em ack, snapshot ou erro.
const KEY = '0123456789abcdef0123456789abcdef'
const databases: CatalogDb[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) }
})
async function fixture(operation: unknown, tmdb: 'accept' | 'refuse' | 'offline' = 'accept') {
  const db = new CatalogDb('test-077-tmdb-' + crypto.randomUUID()); databases.push(db)
  const credentials = { deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A', deviceKey: 'b'.repeat(42) + 'A',
    authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  await persistCredentialIssuance(db, credentials, 'enrollment-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const calls: { path: string; options: { method?: string; bearer?: string; body?: unknown } }[] = []
  let pending = operation
  const request = vi.fn(async (path: string, options: { method?: string; bearer?: string; body?: unknown }) => {
    calls.push({ path, options })
    if (path.endsWith('/device/integrations/tmdb')) return { operation: pending }
    return {}
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (tmdb === 'offline') throw new TypeError('network')
    return new Response(JSON.stringify(tmdb === 'accept' ? { success: true } : { success: false }), { status: tmdb === 'accept' ? 200 : 401 })
  }))
  const signal = new AbortController().signal
  return { db, calls, step: createTmdbRemoteStep(db, connection), signal, next: (value: unknown) => { pending = value; calls.length = 0 } }
}
const ackBody = (calls: { path: string; options: { body?: unknown } }[]) =>
  calls.filter(call => call.path.endsWith('/ack')).map(call => call.options.body)

it('aplica a chave pedida pelo portal: testa no TMDB, guarda, confirma só com o id e o resultado, e o snapshot informa "configured"', async () => {
  const f = await fixture({ operationId: 'op-1', action: 'set', key: KEY })
  expect(await f.step(f.signal)).toBe('applied')
  expect(f.calls[0]).toMatchObject({ path: '/portal/v1/device/integrations/tmdb', options: { method: 'GET' } })
  expect(f.calls[0].options.bearer).toMatch(/^device-a\./)
  expect(ackBody(f.calls)).toEqual([{ operationId: 'op-1', state: 'applied' }])
  expect((await getTmdbStatus({ database: f.db })).state).toBe('connected')
  const snapshot = await capturePortalSnapshot(f.db)
  expect(snapshot.integrations.tmdb).toBe('configured')
  expect(JSON.stringify([f.calls.map(call => call.options.body), snapshot])).not.toContain(KEY)
})

it('chave recusada pelo TMDB: confirma "rejected" sem trocar nada; sem internet: confirma "retry" e mantém', async () => {
  const refused = await fixture({ operationId: 'op-2', action: 'set', key: KEY }, 'refuse')
  expect(await refused.step(refused.signal)).toBe('rejected')
  expect(ackBody(refused.calls)).toEqual([{ operationId: 'op-2', state: 'rejected', reason: 'refused' }])
  expect((await getTmdbStatus({ database: refused.db })).state).toBe('not_configured')
  expect((await capturePortalSnapshot(refused.db)).integrations.tmdb).toBe('none')
  const offline = await fixture({ operationId: 'op-3', action: 'set', key: KEY }, 'offline')
  expect(await offline.step(offline.signal)).toBe('retry')
  expect(ackBody(offline.calls)).toEqual([{ operationId: 'op-3', state: 'retry', reason: 'offline' }])
  for (const f of [refused, offline]) expect(JSON.stringify(f.calls)).not.toContain(KEY.slice(0, 12) + 'x')
})

it('remove a chave guardada, confirma e o snapshot passa a "none"; sem pendência não confirma nada', async () => {
  const f = await fixture({ operationId: 'op-4', action: 'set', key: KEY })
  await f.step(f.signal)
  expect((await capturePortalSnapshot(f.db)).integrations.tmdb).toBe('configured')
  f.next({ operationId: 'op-5', action: 'remove' })
  expect(await f.step(f.signal)).toBe('applied')
  expect(ackBody(f.calls)).toEqual([{ operationId: 'op-5', state: 'applied' }])
  expect((await getTmdbStatus({ database: f.db })).state).toBe('not_configured')
  expect((await capturePortalSnapshot(f.db)).integrations.tmdb).toBe('none')
  f.next(null)
  expect(await f.step(f.signal)).toBe('none')
  expect(ackBody(f.calls)).toEqual([])
})

it('resposta do serviço fora do formato é recusada antes de qualquer efeito, sem eco do conteúdo', async () => {
  for (const operation of [
    { operationId: 'op bad', action: 'set', key: KEY },
    { operationId: 'op-6', action: 'set' },
    { operationId: 'op-6', action: 'set', key: 'curta' },
    { operationId: 'op-6', action: 'remove', key: KEY },
    { operationId: 'op-6', action: 'explode' },
  ]) {
    const f = await fixture(operation)
    const failure = await f.step(f.signal).then(() => undefined, (error: unknown) => error)
    expect(failure).toBeInstanceOf(PortalRequestError)
    expect(String((failure as Error).message)).not.toContain(KEY)
    expect(ackBody(f.calls)).toEqual([])
    expect((await getTmdbStatus({ database: f.db })).state).toBe('not_configured')
  }
})

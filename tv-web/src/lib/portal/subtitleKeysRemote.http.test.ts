import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { getSubtitleKeyStatus, readChosenSubtitleKeys, saveSubtitleKey } from '../subtitles/subtitleCredentials'
import * as subtitleKeys from '../subtitles/subtitleCredentials'
import { acknowledgeCredentialIssuance, persistCredentialIssuance } from './deviceIdentity'
import { PortalConnection } from './portalConnection'
import { PortalRequestError } from './portalClient'
import { portalTables } from './portalTables'
import { createSubtitleKeysRemoteStep, parseInstructions } from './subtitleKeysRemote'

// Feature 091 (ADR-022): adaptador HTTP do passo `integrations` para as chaves de legenda. A chave de teste nunca pode
// aparecer em ack, resposta ao serviço ou erro.
const KEY_SD = 'chave-subdl-ficticia-091-http'
const KEY_OS = 'chave-opensubtitles-ficticia-091-http'
const databases: CatalogDb[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const db of databases.splice(0)) { db.close(); await Dexie.delete(db.name) }
})

type Provider = 'accept' | 'refuse' | 'offline' | 'limit'
async function fixture(operations: unknown, providers: { subdl?: Provider; opensubtitles?: Provider } = {}) {
  const db = new CatalogDb('test-091-keys-' + crypto.randomUUID()); databases.push(db)
  const credentials = { deviceId: 'device-a', bearer: 'device-a.' + 'a'.repeat(42) + 'A', deviceKey: 'b'.repeat(42) + 'A',
    authEpoch: 1, recoveryEpoch: 'c'.repeat(42) + 'A', recoveryCode: '0000-0000-0000-0000-0000-0000-0000', recoveryCodeVersion: 1 }
  await persistCredentialIssuance(db, credentials, 'enrollment-a', Date.now())
  await acknowledgeCredentialIssuance(db, 'enrollment-a', 1)
  const calls: { path: string; options: { method?: string; bearer?: string; body?: unknown } }[] = []
  let pending = operations
  let onRequest: (path: string) => Promise<void> = async () => {}
  const request = vi.fn(async (path: string, options: { method?: string; bearer?: string; body?: unknown }) => {
    calls.push({ path, options })
    await onRequest(path)
    if (path.endsWith('/device/integrations/subtitles')) return { operations: pending }
    return {}
  })
  const connection = new PortalConnection(db, { request: request as never }, 'https://portal.test', () => 'fixture-duid')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const which: Provider = (url.includes('subdl') ? providers.subdl : providers.opensubtitles) ?? 'accept'
    if (which === 'offline') throw new TypeError('network')
    if (which === 'limit') return new Response('{}', { status: 429 })
    if (which === 'refuse') return new Response('{}', { status: 401 })
    return new Response(JSON.stringify({ status: true, subtitles: [], data: [] }), { status: 200 })
  }))
  const signal = new AbortController().signal
  return { db, calls, step: createSubtitleKeysRemoteStep(db, connection), signal, setHook: (hook: (path: string) => Promise<void>) => { onRequest = hook } }
}
const acks = (calls: { path: string; options: { body?: unknown } }[]) =>
  calls.filter(call => call.path.endsWith('/ack')).map(call => call.options.body)

it('aplica a chave do SubDL pedida pelo portal: testa no fornecedor, guarda escolhida, confirma só com fornecedor, id e resultado', async () => {
  const f = await fixture([{ provider: 'subdl', operationId: 'op-1', action: 'set', key: KEY_SD }])
  expect(await f.step(f.signal)).toEqual({ opensubtitles: 'none', subdl: 'applied' })
  expect(f.calls[0]).toMatchObject({ path: '/portal/v1/device/integrations/subtitles', options: { method: 'GET' } })
  expect(f.calls[0].options.bearer).toMatch(/^device-a\./)
  expect(acks(f.calls)).toEqual([{ provider: 'subdl', operationId: 'op-1', state: 'applied' }])
  expect(await readChosenSubtitleKeys({ database: f.db })).toEqual({ subdl: KEY_SD })
  expect(JSON.stringify(f.calls.map(call => call.options.body))).not.toContain(KEY_SD)
})

it('os dois fornecedores juntos: um aceito, o outro recusado ou sem internet — resultados independentes e sem trocar o que não foi aceito', async () => {
  const f = await fixture([
    { provider: 'opensubtitles', operationId: 'op-1', action: 'set', key: KEY_OS },
    { provider: 'subdl', operationId: 'op-2', action: 'set', key: KEY_SD },
  ], { opensubtitles: 'accept', subdl: 'refuse' })
  expect(await f.step(f.signal)).toEqual({ opensubtitles: 'applied', subdl: 'rejected' })
  expect(acks(f.calls)).toEqual([
    { provider: 'opensubtitles', operationId: 'op-1', state: 'applied' },
    { provider: 'subdl', operationId: 'op-2', state: 'rejected', reason: 'refused' },
  ])
  expect(await readChosenSubtitleKeys({ database: f.db })).toEqual({ opensubtitles: KEY_OS })
  expect((await getSubtitleKeyStatus('subdl', { database: f.db })).state).toBe('none')

  const later = await fixture([{ provider: 'subdl', operationId: 'op-3', action: 'set', key: KEY_SD }], { subdl: 'offline' })
  expect(await later.step(later.signal)).toEqual({ opensubtitles: 'none', subdl: 'retry' })
  expect(acks(later.calls)).toEqual([{ provider: 'subdl', operationId: 'op-3', state: 'retry', reason: 'offline' }])
  const limited = await fixture([{ provider: 'subdl', operationId: 'op-4', action: 'set', key: KEY_SD }], { subdl: 'limit' })
  expect((await limited.step(limited.signal)).subdl).toBe('retry')
  expect(acks(limited.calls)).toEqual([{ provider: 'subdl', operationId: 'op-4', state: 'retry', reason: 'rate_limited' }])
})

it.each(['subdl', 'opensubtitles'] as const)('remover %s apaga só a chave pedida, sem salvar nem testar no fornecedor, e confirma', async provider => {
  const f = await fixture([{ provider, operationId: 'op-5', action: 'remove' }])
  await saveSubtitleKey('subdl', KEY_SD, { database: f.db, fetchImpl: async () => new Response('{"status":true,"subtitles":[]}') })
  await saveSubtitleKey('opensubtitles', KEY_OS, { database: f.db, fetchImpl: async () => new Response('{"data":[]}') })
  const save = vi.spyOn(subtitleKeys, 'saveSubtitleKey')
  expect(await f.step(f.signal)).toEqual(provider === 'subdl'
    ? { opensubtitles: 'none', subdl: 'applied' } : { opensubtitles: 'applied', subdl: 'none' })
  expect(acks(f.calls)).toEqual([{ provider, operationId: 'op-5', state: 'applied' }])
  expect(await readChosenSubtitleKeys({ database: f.db })).toEqual(provider === 'subdl' ? { opensubtitles: KEY_OS } : { subdl: KEY_SD })
  expect(await getSubtitleKeyStatus(provider, { database: f.db })).toEqual({ provider, state: 'none', chosen: false })
  expect(save).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('resposta do serviço fora da forma é descartada antes de qualquer efeito (e a chave não vai em erro)', async () => {
  const bad: unknown[] = [
    [{ provider: 'subdl', operationId: 'op-1', action: 'set', key: 'curta' }],
    [{ provider: 'subdl', operationId: 'op-1', action: 'set' }],
    [{ provider: 'subdl', operationId: 'op-1', action: 'remove', key: KEY_SD }],
    [{ provider: 'outro', operationId: 'op-1', action: 'remove' }],
    [{ provider: 'subdl', operationId: 'op com espaço', action: 'remove' }],
    [{ provider: 'subdl', operationId: 'a', action: 'remove' }, { provider: 'opensubtitles', operationId: 'b', action: 'remove' }, { provider: 'subdl', operationId: 'c', action: 'remove' }],
    'texto', null,
  ]
  for (const value of bad) {
    const f = await fixture(value)
    const failure = await f.step(f.signal).then(() => undefined, (error: unknown) => error)
    expect(failure).toBeInstanceOf(PortalRequestError)
    expect(acks(f.calls)).toEqual([])
    expect(await readChosenSubtitleKeys({ database: f.db })).toEqual({})
  }
  expect(() => parseInstructions({ operations: [{ provider: 'subdl', operationId: 'op-1', action: 'set', key: KEY_SD }] })).not.toThrow()
})

it('a identidade da TV trocada no meio do passo aborta antes de gravar ou confirmar', async () => {
  const f = await fixture([{ provider: 'subdl', operationId: 'op-1', action: 'set', key: KEY_SD }])
  f.setHook(async (path) => {
    if (path.endsWith('/device/integrations/subtitles')) await portalTables(f.db).device.update('device', { authEpoch: 2 })
  })
  const failure = await f.step(f.signal).then(() => undefined, (error: unknown) => error)
  expect(failure).toBeInstanceOf(PortalRequestError)
  expect(acks(f.calls)).toEqual([])
  expect(await readChosenSubtitleKeys({ database: f.db })).toEqual({})
  expect(String((failure as Error).message)).not.toContain(KEY_SD)
})

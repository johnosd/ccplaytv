import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import type { SpeedTestResult } from './speedTest'
import { clearLastSpeedTestResult, readLastSpeedTestResult, saveLastSpeedTestResult } from './speedTestRepository'

const result: SpeedTestResult = {
  version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000,
  downloadMbps: 30, latencyMs: 20, jitterMs: 2, status: 'complete', reason: 'completed',
  durationMs: 3500, requestedBytes: 26_000_009, receivedBytes: 26_000_009, latencySamples: 8, downloadSamples: 3,
}
const databases: CatalogDb[] = []
function createDb() {
  const database = new CatalogDb(`test-062-${crypto.randomUUID()}`)
  databases.push(database)
  return database
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map((db) => db.delete())) })

describe('speedTestRepository — dados e armazenamento', () => {
  it('informa operação e categoria sem alterar o contrato de falha', async () => {
    const database = createDb()
    const onUnavailable = vi.fn()
    vi.spyOn(database.networkDiagnostics, 'put').mockRejectedValue(new DOMException('private details', 'QuotaExceededError'))
    expect(await saveLastSpeedTestResult({ state: 'completed', result }, { database, onUnavailable })).toBe('unavailable')
    expect(onUnavailable).toHaveBeenLastCalledWith('NET-W-QUOTA')
    vi.spyOn(database.networkDiagnostics, 'get').mockRejectedValue(new DOMException('private details', 'NotFoundError'))
    await expect(readLastSpeedTestResult({ database, onUnavailable })).rejects.toThrow('storage_unavailable')
    expect(onUnavailable).toHaveBeenLastCalledWith('NET-R-TABLE')
    vi.spyOn(database.networkDiagnostics, 'delete').mockRejectedValue(new DOMException('private details', 'AbortError'))
    await expect(clearLastSpeedTestResult({ database, onUnavailable })).rejects.toThrow('storage_unavailable')
    expect(onUnavailable).toHaveBeenLastCalledWith('NET-D-ABORT')
  })

  it('ignora registro corrompido e rejeita NaN/Infinity sem sobrescrever anterior', async () => {
    const database = createDb()
    await database.networkDiagnostics.put({ ...result, id: 'last', latencyMs: NaN })
    expect(await readLastSpeedTestResult({ database })).toBeNull()
    await database.networkDiagnostics.put({ ...result, id: 'last', measuredAt: Number.MAX_VALUE })
    expect(await readLastSpeedTestResult({ database })).toBeNull()
    await saveLastSpeedTestResult({ state: 'completed', result }, { database })
    expect(await saveLastSpeedTestResult({ state: 'completed', result: { ...result, downloadMbps: Infinity } }, { database })).toBe('ignored')
    expect(await readLastSpeedTestResult({ database })).toEqual(result)
  })

  it('projeta só campos públicos e sanitiza quota/leitura', async () => {
    const database = createDb()
    await saveLastSpeedTestResult({ state: 'completed', result: { ...result, privateField: 'must not persist' } as SpeedTestResult }, { database })
    expect(await database.networkDiagnostics.get('last')).toEqual({ ...result, id: 'last' })
    vi.spyOn(database.networkDiagnostics, 'put').mockRejectedValue(new DOMException('private details', 'QuotaExceededError'))
    expect(await saveLastSpeedTestResult({ state: 'completed', result }, { database })).toBe('unavailable')
    vi.spyOn(database.networkDiagnostics, 'get').mockRejectedValue(new Error('private details'))
    await expect(readLastSpeedTestResult({ database })).rejects.toThrow('storage_unavailable')
  })

  it('adiciona singleton em v17 e preserva fontes/estado da v16', async () => {
    const database = createDb()
    const previous = new Dexie(database.name)
    const schema = Object.fromEntries(database.tables.filter((t) => t.name !== 'networkDiagnostics').map((t) => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map((index) => index.src)].join(',')]))
    previous.version(16).stores(schema)
    const source = { id: 'source-a', type: 'm3u_url', displayName: 'Lista', connectionState: 'never_synced' }
    const state = { stableId: 'a|movie|id:1', sourceId: 'source-a', isFavorite: true }
    try {
      await previous.table('sources').put(source)
      await previous.table('userStates').put(state)
    } finally { previous.close() }
    await database.open()
    expect(database.verno).toBeGreaterThanOrEqual(17)
    expect(await database.sources.get(source.id)).toEqual(source)
    expect(await database.userStates.get(state.stableId)).toEqual(state)
    expect(await database.networkDiagnostics.count()).toBe(0)
    expect(await saveLastSpeedTestResult({ state: 'completed', result }, { database })).toBe('written')
  })
})

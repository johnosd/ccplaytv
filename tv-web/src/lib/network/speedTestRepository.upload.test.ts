import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import type { SpeedTestResult } from './speedTest'
import { readLastSpeedTestResult, saveLastSpeedTestResult } from './speedTestRepository'

let database: CatalogDb
beforeEach(async () => { database = new CatalogDb(`test-speed-upload-${Math.random().toString(36).slice(2)}`); await database.open() })
afterEach(async () => { await database.delete() })

const table = () => database.table('networkDiagnostics')
const base: SpeedTestResult = {
  version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000, downloadMbps: 30, latencyMs: 20, jitterMs: 2,
  status: 'complete', reason: 'completed', durationMs: 7000, requestedBytes: 26_000_009, receivedBytes: 26_000_009,
  latencySamples: 8, downloadSamples: 3, uploadMbps: 12.5, uploadSamples: 3, uploadRequestedBytes: 26_000_000, uploadSentBytes: 26_000_000,
}

describe('speedTestRepository — upload (feature 064)', () => {
  it('um resultado só com upload válido (sem download nem latência) é aceito como parcial', async () => {
    const only: SpeedTestResult = { ...base, downloadMbps: null, latencyMs: null, jitterMs: null, downloadSamples: 0, latencySamples: 0, status: 'partial' }
    expect(await saveLastSpeedTestResult({ state: 'completed', result: only }, { database })).toBe('written')
    expect(await readLastSpeedTestResult({ database })).toEqual(only)
  })

  it('upload com número mas sem amostra, ou enviado maior que o pedido, é inválido e não é gravado', async () => {
    const options = { database }
    expect(await saveLastSpeedTestResult({ state: 'completed', result: { ...base, uploadSamples: 0 } }, options)).toBe('ignored')
    expect(await saveLastSpeedTestResult({ state: 'completed', result: { ...base, uploadSentBytes: 26_000_001 } }, options)).toBe('ignored')
    expect(await saveLastSpeedTestResult({ state: 'completed', result: { ...base, uploadRequestedBytes: 75_000_001, uploadSentBytes: 75_000_001 } }, options)).toBe('ignored')
    expect(await readLastSpeedTestResult(options)).toBeNull()
  })

  it('campos de upload soltos num resultado antigo são descartados na leitura, que segue "não medido"', async () => {
    const { uploadMbps: _omitted, ...legacy } = base
    void _omitted
    await table().put({ ...legacy, status: 'complete', requestedBytes: 90_000_000, receivedBytes: 90_000_000, id: 'last' })
    const read = await readLastSpeedTestResult({ database })
    expect(read).not.toHaveProperty('uploadMbps')
    expect(read).not.toHaveProperty('uploadSamples')
    expect(read?.requestedBytes).toBe(90_000_000)
  })

  it('a leitura normaliza o upload inválido sem tocar no registro gravado', async () => {
    await table().put({ ...base, uploadMbps: -1, id: 'last' })
    expect(await readLastSpeedTestResult({ database })).toMatchObject({ uploadMbps: null, uploadSamples: 0, status: 'partial', downloadMbps: 30 })
    expect(await table().get('last')).toMatchObject({ uploadMbps: -1 })
  })

  it.each([
    { uploadSamples: 0 },
    { uploadSentBytes: 26_000_001 },
    { uploadRequestedBytes: 75_000_001, uploadSentBytes: 75_000_001 },
  ])('preserva as outras métricas na leitura de upload inconsistente: %j', async (patch) => {
    const record = { ...base, ...patch, id: 'last' }
    await table().put(record)
    expect(await readLastSpeedTestResult({ database })).toEqual({
      ...base, status: 'partial', uploadMbps: null, uploadSamples: 0, uploadRequestedBytes: 0, uploadSentBytes: 0,
    })
    expect(await table().get('last')).toEqual(record)
  })

  it('a gravação não leva campo extra, e o upload só é gravado quando o resultado o tem', async () => {
    await saveLastSpeedTestResult({ state: 'completed', result: { ...base, extra: 'não' } as SpeedTestResult }, { database })
    expect(Object.keys(await table().get('last')).sort()).toEqual([
      'destination', 'downloadMbps', 'downloadSamples', 'durationMs', 'id', 'jitterMs', 'latencyMs', 'latencySamples', 'measuredAt', 'reason',
      'receivedBytes', 'requestedBytes', 'status', 'uploadMbps', 'uploadRequestedBytes', 'uploadSamples', 'uploadSentBytes', 'version',
    ])
  })
})

import { expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import type { SpeedTestResult } from './speedTest'
import { clearLastSpeedTestResult, readLastSpeedTestResult, saveLastSpeedTestResult } from './speedTestRepository'

it('C4 FR-016/017: persiste apenas o último resultado válido, preserva-o em cancelamento/falha e remove na limpeza', async () => {
  const database = new CatalogDb('contract-062-last-result')
  const options = { database }
  const first: SpeedTestResult = {
    version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000,
    downloadMbps: 30, latencyMs: 20, jitterMs: 2, status: 'complete', reason: 'completed',
    durationMs: 3500, requestedBytes: 26_000_009, receivedBytes: 26_000_009, latencySamples: 8, downloadSamples: 3,
  }
  const second: SpeedTestResult = { ...first, measuredAt: first.measuredAt + 60_000, downloadMbps: null, status: 'partial', reason: 'time_limit', downloadSamples: 0 }
  try {
    expect(await readLastSpeedTestResult(options)).toBeNull()
    expect(await saveLastSpeedTestResult({ state: 'completed', result: first }, options)).toBe('written')
    expect(await saveLastSpeedTestResult({ state: 'completed', result: second }, options)).toBe('written')
    expect(await saveLastSpeedTestResult({ state: 'cancelled' }, options)).toBe('ignored')
    expect(await saveLastSpeedTestResult({ state: 'failed', error: 'insufficient_samples' }, options)).toBe('ignored')
    expect(await saveLastSpeedTestResult({ state: 'completed', result: { ...second, latencyMs: null, jitterMs: null } }, options)).toBe('ignored')
    database.close()
    await database.open()
    expect(await readLastSpeedTestResult(options)).toEqual(second)
    expect(await database.table('networkDiagnostics').count()).toBe(1)
    const record = await database.table('networkDiagnostics').get('last')
    expect(record).toEqual({ ...second, id: 'last' })
    await clearLastSpeedTestResult(options)
    expect(await readLastSpeedTestResult(options)).toBeNull()
  } finally {
    await database.delete()
  }
})

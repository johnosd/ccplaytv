import { db, type CatalogDb } from '../catalog/db'
import type { SpeedTestOutcome, SpeedTestResult } from './speedTest'

export type NetworkDiagnosticRecord = SpeedTestResult & { id: 'last' }
export interface SpeedTestRepositoryOptions { database?: CatalogDb }

function valid(value: unknown): value is SpeedTestResult {
  if (!value || typeof value !== 'object') return false
  const r = value as SpeedTestResult
  const positive = (v: number | null) => v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0)
  const nonnegative = (v: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  if (r.version !== 1 || r.destination !== 'cloudflare' || !nonnegative(r.measuredAt) || !nonnegative(r.durationMs)) return false
  if (!Number.isFinite(new Date(r.measuredAt).getTime())) return false
  if (!positive(r.downloadMbps) || !positive(r.latencyMs) || !(r.jitterMs === null || nonnegative(r.jitterMs))) return false
  if (r.downloadMbps === null && r.latencyMs === null && r.jitterMs === null) return false
  if ([r.requestedBytes, r.receivedBytes, r.latencySamples, r.downloadSamples].some((v) => !Number.isSafeInteger(v) || v < 0)) return false
  if (r.requestedBytes > 100_000_000 || r.receivedBytes > r.requestedBytes || r.latencySamples > 8) return false
  if ((r.latencyMs !== null || r.jitterMs !== null) && r.latencySamples < 5) return false
  if ((r.latencyMs === null) !== (r.jitterMs === null)) return false
  if (r.downloadMbps !== null && r.downloadSamples < 1) return false
  const complete = r.downloadMbps !== null && r.latencyMs !== null && r.jitterMs !== null
  return r.status === (complete ? 'complete' : 'partial') && ['completed', 'time_limit', 'byte_limit', 'measurement_error'].includes(r.reason)
}

/** Projeção explícita: mesmo um objeto contaminado não grava campos extras. */
function clean(r: SpeedTestResult): SpeedTestResult {
  return {
    version: 1, measuredAt: r.measuredAt, destination: 'cloudflare',
    downloadMbps: r.downloadMbps, latencyMs: r.latencyMs, jitterMs: r.jitterMs,
    status: r.status, reason: r.reason, durationMs: r.durationMs,
    requestedBytes: r.requestedBytes, receivedBytes: r.receivedBytes,
    latencySamples: r.latencySamples, downloadSamples: r.downloadSamples,
  }
}

export async function readLastSpeedTestResult(options: SpeedTestRepositoryOptions = {}): Promise<SpeedTestResult | null> {
  try {
    const record = await (options.database ?? db).networkDiagnostics.get('last')
    return valid(record) ? clean(record) : null
  } catch { throw new Error('storage_unavailable') }
}

export async function saveLastSpeedTestResult(outcome: SpeedTestOutcome, options: SpeedTestRepositoryOptions = {}): Promise<'written' | 'ignored' | 'unavailable'> {
  if (outcome.state !== 'completed' || !valid(outcome.result)) return 'ignored'
  try {
    await (options.database ?? db).networkDiagnostics.put({ ...clean(outcome.result), id: 'last' })
    return 'written'
  } catch { return 'unavailable' }
}

export async function clearLastSpeedTestResult(options: SpeedTestRepositoryOptions = {}): Promise<void> {
  try { await (options.database ?? db).networkDiagnostics.delete('last') }
  catch { throw new Error('storage_unavailable') }
}

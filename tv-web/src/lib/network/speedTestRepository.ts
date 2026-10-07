import { db, type CatalogDb } from '../catalog/db'
import type { SpeedTestOutcome, SpeedTestResult } from './speedTest'
import { storageFailureCode, type SpeedTestStorageCode } from './storageFailure'

export type NetworkDiagnosticRecord = SpeedTestResult & { id: 'last' }
export interface SpeedTestRepositoryOptions {
  database?: CatalogDb
  onUnavailable?: (code: SpeedTestStorageCode) => void
}

/** Teto de cada etapa e do teste inteiro quando há upload (feature 064). Sem upload vale o da 062: 100 MB. */
const PHASE_MAX_BYTES = 75_000_000
const TEST_MAX_BYTES = 150_000_000
const LEGACY_MAX_BYTES = 100_000_000

const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

function uploadFieldsValid(r: SpeedTestResult): boolean {
  return (r.uploadMbps === null || isPositive(r.uploadMbps))
    && isCount(r.uploadSamples) && isCount(r.uploadRequestedBytes) && isCount(r.uploadSentBytes)
    && r.uploadRequestedBytes <= PHASE_MAX_BYTES && r.uploadSentBytes <= r.uploadRequestedBytes
    && (r.uploadMbps === null || r.uploadSamples >= 1)
}

/** Completo = download, latência e jitter válidos e, havendo upload no registro, o upload também (feature 064, D-007). */
function isComplete(r: SpeedTestResult): boolean {
  return r.downloadMbps !== null && r.latencyMs !== null && r.jitterMs !== null
    && (r.uploadMbps === undefined || r.uploadMbps !== null)
}

/**
 * O que foi gravado é lido assim (FR-012/FR-014): sem `uploadMbps` é resultado de antes da feature ("não medido"),
 * e campos `upload*` soltos são descartados; com `uploadMbps` mas algum campo de upload inválido, o upload vira
 * indisponível (`null`) e o resto continua legível, deixando de ser "completo".
 */
function normalize(r: SpeedTestResult): SpeedTestResult {
  if (r.uploadMbps === undefined) {
    const legacy = { ...r }
    delete legacy.uploadSamples
    delete legacy.uploadRequestedBytes
    delete legacy.uploadSentBytes
    return legacy
  }
  if (uploadFieldsValid(r)) return r
  const unavailable: SpeedTestResult = { ...r, uploadMbps: null, uploadSamples: 0, uploadRequestedBytes: 0, uploadSentBytes: 0 }
  return { ...unavailable, status: isComplete(unavailable) ? 'complete' : 'partial' }
}

function valid(value: unknown): value is SpeedTestResult {
  if (!value || typeof value !== 'object') return false
  const r = value as SpeedTestResult
  const positive = (v: number | null) => v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0)
  const nonnegative = (v: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  const hasUpload = r.uploadMbps !== undefined
  if (r.version !== 1 || r.destination !== 'cloudflare' || !nonnegative(r.measuredAt) || !nonnegative(r.durationMs)) return false
  if (!Number.isFinite(new Date(r.measuredAt).getTime())) return false
  if (!positive(r.downloadMbps) || !positive(r.latencyMs) || !(r.jitterMs === null || nonnegative(r.jitterMs))) return false
  if (hasUpload && !uploadFieldsValid(r)) return false
  const uploadMeasured = hasUpload && r.uploadMbps !== null
  if (r.downloadMbps === null && r.latencyMs === null && r.jitterMs === null && !uploadMeasured) return false
  if ([r.requestedBytes, r.receivedBytes, r.latencySamples, r.downloadSamples].some((v) => !isCount(v))) return false
  if (r.requestedBytes > (hasUpload ? PHASE_MAX_BYTES : LEGACY_MAX_BYTES) || r.receivedBytes > r.requestedBytes || r.latencySamples > 8) return false
  if (hasUpload) {
    const requested = r.uploadRequestedBytes as number
    if (r.requestedBytes + requested > TEST_MAX_BYTES) return false
  }
  if ((r.latencyMs !== null || r.jitterMs !== null) && r.latencySamples < 5) return false
  if ((r.latencyMs === null) !== (r.jitterMs === null)) return false
  if (r.downloadMbps !== null && r.downloadSamples < 1) return false
  return r.status === (isComplete(r) ? 'complete' : 'partial') && ['completed', 'time_limit', 'byte_limit', 'measurement_error'].includes(r.reason)
}

/** Projeção explícita: mesmo um objeto contaminado não grava campos extras. Upload só entra quando o registro o tem. */
function clean(r: SpeedTestResult): SpeedTestResult {
  const base: SpeedTestResult = {
    version: 1, measuredAt: r.measuredAt, destination: 'cloudflare',
    downloadMbps: r.downloadMbps, latencyMs: r.latencyMs, jitterMs: r.jitterMs,
    status: r.status, reason: r.reason, durationMs: r.durationMs,
    requestedBytes: r.requestedBytes, receivedBytes: r.receivedBytes,
    latencySamples: r.latencySamples, downloadSamples: r.downloadSamples,
  }
  if (r.uploadMbps === undefined) return base
  return {
    ...base, uploadMbps: r.uploadMbps, uploadSamples: r.uploadSamples,
    uploadRequestedBytes: r.uploadRequestedBytes, uploadSentBytes: r.uploadSentBytes,
  }
}

export async function readLastSpeedTestResult(options: SpeedTestRepositoryOptions = {}): Promise<SpeedTestResult | null> {
  try {
    const record = await (options.database ?? db).networkDiagnostics.get('last')
    if (!record || typeof record !== 'object') return null
    const normalized = normalize(record)
    return valid(normalized) ? clean(normalized) : null
  } catch (error) {
    options.onUnavailable?.(storageFailureCode('R', error))
    throw new Error('storage_unavailable')
  }
}

export async function saveLastSpeedTestResult(outcome: SpeedTestOutcome, options: SpeedTestRepositoryOptions = {}): Promise<'written' | 'ignored' | 'unavailable'> {
  if (outcome.state !== 'completed' || !valid(outcome.result)) return 'ignored'
  try {
    await (options.database ?? db).networkDiagnostics.put({ ...clean(outcome.result), id: 'last' })
    return 'written'
  } catch (error) {
    options.onUnavailable?.(storageFailureCode('W', error))
    return 'unavailable'
  }
}

export async function clearLastSpeedTestResult(options: SpeedTestRepositoryOptions = {}): Promise<void> {
  try { await (options.database ?? db).networkDiagnostics.delete('last') }
  catch (error) {
    options.onUnavailable?.(storageFailureCode('D', error))
    throw new Error('storage_unavailable')
  }
}

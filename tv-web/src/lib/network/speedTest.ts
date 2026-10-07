export const SPEED_TEST_DESTINATION = 'https://speed.cloudflare.com/__down'
export const SPEED_TEST_MAX_BYTES = 100_000_000
export const SPEED_TEST_MAX_MS = 30_000

export type SpeedTestError = 'busy' | 'playback_active' | 'offline' | 'rate_limited' | 'destination_unavailable' | 'stream_unsupported' | 'insufficient_samples' | 'storage_unavailable'

export interface SpeedTestResult {
  version: 1
  measuredAt: number
  destination: 'cloudflare'
  downloadMbps: number | null
  latencyMs: number | null
  jitterMs: number | null
  status: 'complete' | 'partial'
  reason: 'completed' | 'time_limit' | 'byte_limit' | 'measurement_error'
  durationMs: number
  requestedBytes: number
  receivedBytes: number
  latencySamples: number
  downloadSamples: number
  /**
   * Feature 064 (upload). Ausente em resultado gravado antes dela = "não medido". Resultado novo
   * traz sempre os quatro campos: `uploadMbps: null` = foi tentado e não teve amostra válida.
   */
  uploadMbps?: number | null
  uploadSamples?: number
  uploadRequestedBytes?: number
  uploadSentBytes?: number
}

export type SpeedTestOutcome =
  | { state: 'completed'; result: SpeedTestResult }
  | { state: 'cancelled' }
  | { state: 'failed'; error: SpeedTestError }

export interface SpeedTestProgress {
  stage: 'warmup' | 'latency' | 'download' | 'upload' | 'stopping'
  elapsedMs: number
  requestedBytes: number
  receivedBytes: number
  /** Feature 064: bytes de upload que o destino já confirmou. Só existe na etapa `'upload'`. */
  sentBytes?: number
}

export interface SpeedTestOptions {
  signal: AbortSignal
  fetchImpl?: typeof fetch
  monotonicNow?: () => number
  wallClockNow?: () => number
  onProgress?: (progress: SpeedTestProgress) => void
  /** Feature 064: teto desta etapa. Ausente = `SPEED_TEST_MAX_*`, o que a 062 trava. */
  limits?: { maxBytes: number; maxMs: number }
}

let running = false

class MeasurementError extends Error {
  readonly code: SpeedTestError
  constructor(code: SpeedTestError) { super(code); this.code = code }
}

/** Medição HTTP limitada; nenhum dado de fonte entra nesta interface. */
export async function runSpeedTest(options: SpeedTestOptions): Promise<SpeedTestOutcome> {
  if (options.signal.aborted) return { state: 'cancelled' }
  if (running) return { state: 'failed', error: 'busy' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'failed', error: 'offline' }
  running = true
  const now = options.monotonicNow ?? (() => performance.now())
  const wallClock = options.wallClockNow ?? Date.now
  const fetchImpl = options.fetchImpl ?? fetch
  // Feature 064: o teste de conexão usa 30 s / 75 MB por etapa; sem `limits` valem os da 062 (travados por C1–C3).
  const maxBytes = options.limits?.maxBytes ?? SPEED_TEST_MAX_BYTES
  const maxMs = options.limits?.maxMs ?? SPEED_TEST_MAX_MS
  const startedAt = now()
  const controller = new AbortController()
  let stopped: 'cancelled' | 'time_limit' | null = null
  let reason: SpeedTestResult['reason'] = 'completed'
  let error: SpeedTestError = 'destination_unavailable'
  let requestedBytes = 0
  let receivedBytes = 0
  let downloadBytes = 0
  let downloadMs = 0
  let downloadSamples = 0
  let stage: SpeedTestProgress['stage'] = 'warmup'
  const latency: number[] = []

  function stop(value: 'cancelled' | 'time_limit') {
    if (stopped === null || value === 'cancelled') stopped = value
    controller.abort()
  }
  const cancel = () => stop('cancelled')
  options.signal.addEventListener('abort', cancel, { once: true })
  const deadline = setTimeout(() => stop('time_limit'), maxMs)
  function checkStop() {
    if (options.signal.aborted) stop('cancelled')
    if (stopped === null && now() - startedAt >= maxMs) stop('time_limit')
    if (stopped !== null) throw new MeasurementError('insufficient_samples')
  }
  function report() {
    options.onProgress?.({ stage, elapsedMs: Math.max(0, now() - startedAt), requestedBytes, receivedBytes })
  }

  async function measure(bytes: number, nextStage: SpeedTestProgress['stage']): Promise<number> {
    checkStop()
    stage = nextStage
    requestedBytes += bytes
    report()
    const requestStart = now()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const response = await fetchImpl(`${SPEED_TEST_DESTINATION}?bytes=${bytes}`, {
        method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new MeasurementError(response.status === 429 ? 'rate_limited' : 'destination_unavailable')
      }
      if (!response.body?.getReader) throw new MeasurementError('stream_unsupported')
      reader = response.body.getReader()
      const declared = response.headers.get('content-length')
      if (declared !== null && Number(declared) !== bytes) throw new MeasurementError('destination_unavailable')
      let count = 0
      while (true) {
        checkStop()
        const chunk = await reader.read()
        if (chunk.done) break
        count += chunk.value.byteLength
        receivedBytes += chunk.value.byteLength
        report()
        if (count > bytes) throw new MeasurementError('destination_unavailable')
      }
      checkStop()
      if (count !== bytes) throw new MeasurementError('destination_unavailable')
      return now() - requestStart
    } finally {
      if (reader) {
        try { await reader.cancel() } catch { /* Corpo já abortado/encerrado. */ }
        reader.releaseLock()
      }
    }
  }

  try {
    await measure(1, 'warmup')
    for (let i = 0; i < 8; i += 1) {
      const duration = await measure(1, 'latency')
      if (Number.isFinite(duration) && duration > 0) latency.push(duration)
    }
    const sizes = [1_000_000, 5_000_000, 20_000_000]
    let requestIndex = 0
    while (true) {
      checkStop()
      const available = maxBytes - requestedBytes
      if (available === 0) { reason = 'byte_limit'; break }
      const bytes = Math.min(sizes[Math.min(requestIndex, sizes.length - 1)], available)
      const duration = await measure(bytes, 'download')
      if (Number.isFinite(duration) && duration > 0) {
        downloadBytes += bytes
        downloadMs += duration
        downloadSamples += 1
      }
      requestIndex += 1
      if (requestedBytes === maxBytes) { reason = 'byte_limit'; break }
      if (downloadSamples >= 3 && downloadMs >= 3000) break
    }
  } catch (caught) {
    reason = stopped === 'time_limit' ? 'time_limit' : 'measurement_error'
    error = caught instanceof MeasurementError ? caught.code : 'destination_unavailable'
  } finally {
    stage = 'stopping'
    controller.abort()
    clearTimeout(deadline)
    options.signal.removeEventListener('abort', cancel)
    running = false
  }

  if (stopped === 'cancelled') return { state: 'cancelled' }
  let latencyMs: number | null = null
  let jitterMs: number | null = null
  if (latency.length >= 5) {
    const sorted = [...latency].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    latencyMs = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    jitterMs = latency.slice(1).reduce((sum, value, i) => sum + Math.abs(value - latency[i]), 0) / (latency.length - 1)
  }
  const downloadMbps = downloadBytes >= 1_000_000 && downloadMs >= 200
    ? 8 * downloadBytes / (downloadMs * 1000) : null
  if (latencyMs === null && downloadMbps === null) {
    return { state: 'failed', error: reason === 'measurement_error' ? error : 'insufficient_samples' }
  }
  return { state: 'completed', result: {
    version: 1, measuredAt: wallClock(), destination: 'cloudflare', latencyMs, jitterMs, downloadMbps,
    status: latencyMs !== null && jitterMs !== null && downloadMbps !== null ? 'complete' : 'partial',
    reason, durationMs: Math.max(0, now() - startedAt), requestedBytes, receivedBytes,
    latencySamples: latency.length, downloadSamples,
  } }
}

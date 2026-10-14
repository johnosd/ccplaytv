// Feature 064: o teste de conexão inteiro = o motor da 062 (latência + download, intocado, só com teto menor)
// seguido do upload. Algoritmo e limites: `sdd/specs/064-upload-teste-conexao/logic/upload.md`.
import { runSpeedTest } from './speedTest'
import type { SpeedTestOptions, SpeedTestOutcome, SpeedTestResult } from './speedTest'

export const UPLOAD_DESTINATION = 'https://speed.cloudflare.com/__up'
/** Teto do teste inteiro (latência + download + upload): o pedido do usuário (spec 064 FR-004). */
export const CONNECTION_TEST_MAX_BYTES = 150_000_000
export const CONNECTION_TEST_MAX_MS = 60_000
/** Cada etapa de transferência usa no máximo metade do teto (FR-005); a soma das duas é o teto do teste. */
export const PHASE_MAX_BYTES = CONNECTION_TEST_MAX_BYTES / 2
export const PHASE_MAX_MS = CONNECTION_TEST_MAX_MS / 2

const UPLOAD_SIZES = [1_000_000, 5_000_000, 20_000_000]
const MIN_VALID_BYTES = 1_000_000
const MIN_VALID_MS = 200

/** Separado do `running` de `runSpeedTest`: entre as duas etapas aquele fica livre por um instante. */
let running = false

/** Bytes sem significado gerados pelo app (nada da pessoa ou da fonte): um bloco aleatório repetido. */
function makePayload(size: number): Uint8Array<ArrayBuffer> {
  const block = new Uint8Array(65_536)
  try {
    globalThis.crypto.getRandomValues(block)
  } catch {
    for (let i = 0; i < block.length; i += 1) block[i] = (i * 131 + 7) & 255
  }
  const payload = new Uint8Array(size)
  for (let at = 0; at < size; at += block.length) payload.set(block.subarray(0, Math.min(block.length, size - at)), at)
  return payload
}

type UploadStage =
  | { cancelled: true }
  | { cancelled: false; mbps: number | null; samples: number; requested: number; sent: number; reason: SpeedTestResult['reason'] }

/** Envia blocos até 3 amostras e 3 000 ms, o teto da etapa (30 s / 75 MB) ou um erro. Nunca lança por falha de envio. */
async function runUploadStage(options: SpeedTestOptions, now: () => number, emit: (sentBytes: number) => void): Promise<UploadStage> {
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  let stopped: 'cancelled' | 'time_limit' | null = null
  const stop = (value: 'cancelled' | 'time_limit') => {
    if (stopped === null || value === 'cancelled') stopped = value
    controller.abort()
  }
  const cancel = () => stop('cancelled')
  options.signal.addEventListener('abort', cancel, { once: true })
  const startedAt = now()
  const deadline = setTimeout(() => stop('time_limit'), PHASE_MAX_MS)
  let reason: SpeedTestResult['reason'] = 'completed'
  let requested = 0
  let sent = 0
  let validBytes = 0
  let validMs = 0
  let samples = 0
  try {
    const payload = makePayload(UPLOAD_SIZES[UPLOAD_SIZES.length - 1])
    for (let index = 0; ; index += 1) {
      if (options.signal.aborted) stop('cancelled')
      if (stopped === null && now() - startedAt >= PHASE_MAX_MS) stop('time_limit')
      if (stopped !== null) break
      const available = PHASE_MAX_BYTES - requested
      if (available === 0) { reason = 'byte_limit'; break }
      const bytes = Math.min(UPLOAD_SIZES[Math.min(index, UPLOAD_SIZES.length - 1)], available)
      requested += bytes // reserva antes de enviar e nunca devolve, como no download
      emit(sent)
      const requestStart = now()
      const response = await fetchImpl(UPLOAD_DESTINATION, {
        method: 'POST', body: payload.subarray(0, bytes), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      })
      await response.body?.cancel().catch(() => undefined)
      if (!response.ok) throw new Error('upload recusado')
      const duration = now() - requestStart
      sent += bytes
      if (Number.isFinite(duration) && duration > 0) { validBytes += bytes; validMs += duration; samples += 1 }
      emit(sent)
      if (requested === PHASE_MAX_BYTES) { reason = 'byte_limit'; break }
      if (samples >= 3 && validMs >= 3000) break
    }
  } catch {
    reason = 'measurement_error'
  } finally {
    clearTimeout(deadline)
    options.signal.removeEventListener('abort', cancel)
    controller.abort()
  }
  if (stopped === 'cancelled') return { cancelled: true }
  if (stopped === 'time_limit') reason = 'time_limit'
  const mbps = validBytes >= MIN_VALID_BYTES && validMs >= MIN_VALID_MS ? 8 * validBytes / (validMs * 1000) : null
  return { cancelled: false, mbps, samples, requested, sent, reason }
}

/** Mesma assinatura de `runSpeedTest`: o hook só troca a função. Falha só do upload dá resultado parcial, nunca `failed`. */
export async function runConnectionTest(options: SpeedTestOptions): Promise<SpeedTestOutcome> {
  if (options.signal.aborted) return { state: 'cancelled' }
  if (running) return { state: 'failed', error: 'busy' }
  running = true
  let finished = false
  try {
    const now = options.monotonicNow ?? (() => performance.now())
    const startedAt = now()
    const onProgress = options.onProgress
    const first = await runSpeedTest({
      ...options,
      limits: { maxBytes: PHASE_MAX_BYTES, maxMs: PHASE_MAX_MS },
      onProgress: onProgress && ((progress) => { if (!finished) onProgress(progress) }),
    })
    // Falha total ou cancelamento na primeira etapa encerram o teste: nem se tenta o upload.
    if (first.state !== 'completed') return first
    if (options.signal.aborted) return { state: 'cancelled' }

    const download = first.result
    const upload = await runUploadStage(options, now, (sentBytes) => {
      if (finished || options.signal.aborted) return
      onProgress?.({
        stage: 'upload', elapsedMs: Math.max(0, now() - startedAt), requestedBytes: download.requestedBytes,
        receivedBytes: download.receivedBytes, sentBytes,
      })
    })
    if (upload.cancelled) return { state: 'cancelled' }

    const complete = download.downloadMbps !== null && download.latencyMs !== null && download.jitterMs !== null && upload.mbps !== null
    return { state: 'completed', result: {
      ...download,
      measuredAt: (options.wallClockNow ?? Date.now)(),
      status: complete ? 'complete' : 'partial',
      reason: download.reason !== 'completed' ? download.reason : upload.reason,
      durationMs: Math.max(0, now() - startedAt),
      uploadMbps: upload.mbps, uploadSamples: upload.samples, uploadRequestedBytes: upload.requested, uploadSentBytes: upload.sent,
    } }
  } finally {
    finished = true
    running = false
  }
}

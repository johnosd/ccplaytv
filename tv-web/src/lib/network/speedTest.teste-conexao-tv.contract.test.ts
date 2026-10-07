import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSpeedTest, SPEED_TEST_DESTINATION, SPEED_TEST_MAX_BYTES, SPEED_TEST_MAX_MS } from './speedTest'
import type { SpeedTestOutcome } from './speedTest'

// Transporte controlado: stream em blocos, sem acesso a rede ou mock do motor.
function bodyOfSize(bytes: number): ReadableStream<Uint8Array> {
  let remaining = bytes
  return new ReadableStream({
    pull(controller) {
      if (remaining === 0) { controller.close(); return }
      const size = Math.min(remaining, 1_000_000)
      controller.enqueue(new Uint8Array(size))
      remaining -= size
    },
  })
}

function sizeOf(input: RequestInfo | URL): number {
  const url = new URL(input instanceof Request ? input.url : String(input))
  expect(`${url.origin}${url.pathname}`).toBe(SPEED_TEST_DESTINATION)
  expect([...url.searchParams.keys()]).toEqual(['bytes'])
  return Number(url.searchParams.get('bytes'))
}

function resultOf(outcome: SpeedTestOutcome) {
  expect(outcome.state).toBe('completed')
  if (outcome.state !== 'completed') throw new Error('Expected measured result')
  return outcome.result
}

afterEach(() => vi.useRealTimers())

describe('062 — motor público de teste de conexão', () => {
  it('C1 FR-005/019: calcula métricas reais e faz somente GETs de medição sem credenciais ou reporte', async () => {
    let clock = 0
    let probes = 0
    const requests: number[] = []
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const bytes = sizeOf(input)
      requests.push(bytes)
      expect(init?.method ?? 'GET').toBe('GET')
      expect(init?.credentials).toBe('omit')
      expect(init?.cache).toBe('no-store')
      expect(init?.body).toBeUndefined()
      expect(init?.headers ? [...new Headers(init.headers).keys()] : []).toEqual([])
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      clock += bytes === 1 ? (probes++ === 0 ? 5 : (probes - 1) * 10) : 1000
      return new Response(bodyOfSize(bytes), { headers: { 'content-length': String(bytes) } })
    })
    const result = resultOf(await runSpeedTest({ signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock, wallClockNow: () => 1_800_000_000_000 }))
    expect(result).toMatchObject({ version: 1, destination: 'cloudflare', status: 'complete', reason: 'completed', measuredAt: 1_800_000_000_000, latencyMs: 45, jitterMs: 10, latencySamples: 8, downloadSamples: 3 })
    expect(result.downloadMbps).toBeCloseTo(8 * 26_000_000 / (3000 * 1000), 6)
    expect(result.requestedBytes).toBe(26_000_009)
    expect(result.receivedBytes).toBe(result.requestedBytes)
    expect(result.durationMs).toBe(3365)
    expect(requests.reduce((sum, n) => sum + n, 0)).toBe(result.requestedBytes)
    expect(fetchImpl).toHaveBeenCalledTimes(12)
  })

  it('C2 FR-007/008: reserva todo payload até 100 MB, limita o último corpo e preserva apenas métricas válidas', async () => {
    let clock = 0
    const requests: number[] = []
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const bytes = sizeOf(input)
      requests.push(bytes)
      clock += bytes === 1 ? 1 : 10
      return new Response(bodyOfSize(bytes), { headers: { 'content-length': String(bytes) } })
    })
    const result = resultOf(await runSpeedTest({ signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock }))
    expect(result).toMatchObject({ status: 'partial', reason: 'byte_limit', requestedBytes: SPEED_TEST_MAX_BYTES, receivedBytes: SPEED_TEST_MAX_BYTES, latencyMs: 1, jitterMs: 0, downloadMbps: null })
    expect(requests.reduce((sum, n) => sum + n, 0)).toBe(100_000_000)
    expect(requests.at(-1)).toBeGreaterThan(0)
    expect(requests.at(-1)).toBeLessThan(20_000_000)
    expect(Math.max(...requests)).toBeLessThanOrEqual(20_000_000)
    const count = requests.length
    await Promise.resolve()
    expect(requests).toHaveLength(count)
  })

  it('C3 FR-008/009/010: aborta o corpo no deadline e no cancelamento, bloqueia sobreposição e libera repetição', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let clock = 0
    let active = 0
    let startedDownload!: () => void
    let downloadStarted = new Promise<void>((resolve) => { startedDownload = resolve })
    const signals: AbortSignal[] = []
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const bytes = sizeOf(input)
      clock += 10
      if (bytes === 1) return new Response(bodyOfSize(1), { headers: { 'content-length': '1' } })
      const signal = init?.signal
      if (!signal) throw new Error('AbortSignal required')
      signals.push(signal)
      active += 1
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(1024))
          signal.addEventListener('abort', () => {
            active -= 1
            controller.error(new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        },
      })
      return new Response(body, { headers: { 'content-length': String(bytes) } })
    })
    const options = { fetchImpl, monotonicNow: () => clock }
    const limited = runSpeedTest({ ...options, signal: new AbortController().signal, onProgress: (progress) => {
      if (progress.receivedBytes >= 1033) startedDownload()
    } })
    // O await do stub comprova vermelho; a promessa de download pertence só ao fake.
    await Promise.race([downloadStarted, limited.then(() => undefined)])
    clock += SPEED_TEST_MAX_MS
    await vi.advanceTimersByTimeAsync(SPEED_TEST_MAX_MS)
    const partial = resultOf(await limited)
    expect(partial.reason).toBe('time_limit')
    expect(partial.downloadMbps).toBeNull()
    expect(partial.receivedBytes).toBe(1033)
    expect(partial.requestedBytes).toBe(1_000_009)
    expect(active).toBe(0)
    expect(signals.every((signal) => signal.aborted)).toBe(true)

    downloadStarted = new Promise<void>((resolve) => { startedDownload = resolve })
    const cancel = new AbortController()
    const progress = vi.fn((value: { receivedBytes: number }) => {
      if (value.receivedBytes >= 1033) startedDownload()
    })
    const cancelled = runSpeedTest({ ...options, signal: cancel.signal, onProgress: progress })
    await downloadStarted
    const callCount = vi.mocked(fetchImpl).mock.calls.length
    expect(await runSpeedTest({ ...options, signal: new AbortController().signal })).toEqual({ state: 'failed', error: 'busy' })
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(callCount)
    cancel.abort()
    expect(await cancelled).toEqual({ state: 'cancelled' })
    expect(active).toBe(0)
    const progressCount = progress.mock.calls.length
    await vi.advanceTimersByTimeAsync(SPEED_TEST_MAX_MS)
    expect(progress).toHaveBeenCalledTimes(progressCount)
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(callCount)
    const preCancelled = new AbortController()
    preCancelled.abort()
    expect(await runSpeedTest({ ...options, signal: preCancelled.signal })).toEqual({ state: 'cancelled' })
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(callCount)
  })
})

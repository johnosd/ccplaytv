import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONNECTION_TEST_MAX_BYTES, CONNECTION_TEST_MAX_MS, runConnectionTest, UPLOAD_DESTINATION } from './connectionTest'
import { SPEED_TEST_DESTINATION } from './speedTest'
import type { SpeedTestOutcome } from './speedTest'

// Transporte controlado: GET (download) e POST (upload) simulados, sem rede e sem mockar o motor.
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

interface Call { kind: 'down' | 'up'; bytes: number }

/** Só os dois endereços do destino são aceitos; o do upload não leva nenhum parâmetro. */
function callOf(input: RequestInfo | URL, init?: RequestInit): Call {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const where = `${url.origin}${url.pathname}`
  if (where === SPEED_TEST_DESTINATION) {
    expect([...url.searchParams.keys()]).toEqual(['bytes'])
    return { kind: 'down', bytes: Number(url.searchParams.get('bytes')) }
  }
  expect(where).toBe(UPLOAD_DESTINATION)
  expect([...url.searchParams.keys()]).toEqual([])
  expect(init?.body).toBeInstanceOf(Uint8Array)
  return { kind: 'up', bytes: (init?.body as Uint8Array).byteLength }
}

function expectSafeRequest(init?: RequestInit) {
  expect(init?.credentials).toBe('omit')
  expect(init?.cache).toBe('no-store')
  expect(init?.redirect).toBe('error')
  expect(init?.headers ? [...new Headers(init.headers).keys()] : []).toEqual([])
  expect(init?.signal).toBeInstanceOf(AbortSignal)
}

function resultOf(outcome: SpeedTestOutcome) {
  expect(outcome.state).toBe('completed')
  if (outcome.state !== 'completed') throw new Error('Expected measured result')
  return outcome.result
}

afterEach(() => vi.useRealTimers())

describe('064 — teste de conexão com upload', () => {
  it('U1 US1/AC1 FR-001..005: depois do download, mede o upload com POSTs sequenciais, sem credencial, e completa com as quatro métricas', async () => {
    let clock = 0
    let probes = 0
    const log: Call[] = []
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const call = callOf(input, init)
      log.push(call)
      expectSafeRequest(init)
      if (call.kind === 'up') {
        expect(init?.method).toBe('POST')
        clock += 1000
        return new Response(null, { status: 200 })
      }
      expect(init?.method ?? 'GET').toBe('GET')
      expect(init?.body).toBeUndefined()
      clock += call.bytes === 1 ? (probes++ === 0 ? 5 : (probes - 1) * 10) : 1000
      return new Response(bodyOfSize(call.bytes), { headers: { 'content-length': String(call.bytes) } })
    })

    const result = resultOf(await runConnectionTest({ signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock, wallClockNow: () => 1_800_000_000_000 }))

    expect(result).toMatchObject({
      version: 1, destination: 'cloudflare', status: 'complete', reason: 'completed', measuredAt: 1_800_000_000_000,
      latencyMs: 45, jitterMs: 10, latencySamples: 8, downloadSamples: 3, requestedBytes: 26_000_009, receivedBytes: 26_000_009,
      uploadSamples: 3, uploadRequestedBytes: 26_000_000, uploadSentBytes: 26_000_000,
    })
    expect(result.downloadMbps).toBeCloseTo(8 * 26_000_000 / (3000 * 1000), 6)
    expect(result.uploadMbps).toBeCloseTo(8 * 26_000_000 / (3000 * 1000), 6)
    expect(result.durationMs).toBe(3365 + 3000)
    // Sequencial: todo o download termina antes do primeiro POST; nunca em paralelo.
    const firstUp = log.findIndex((call) => call.kind === 'up')
    expect(log.slice(0, firstUp).every((call) => call.kind === 'down')).toBe(true)
    expect(log.slice(firstUp).every((call) => call.kind === 'up')).toBe(true)
    expect(log.filter((call) => call.kind === 'up').map((call) => call.bytes)).toEqual([1_000_000, 5_000_000, 20_000_000])
    expect(log).toHaveLength(15)
    expect(result.requestedBytes + (result.uploadRequestedBytes ?? 0)).toBeLessThanOrEqual(CONNECTION_TEST_MAX_BYTES)
  })

  it('U2 FR-004/005/006: cada etapa usa no máximo metade do teto (75 MB), o total nunca passa de 150 MB e nada é pedido depois do limite', async () => {
    let clock = 0
    const log: Call[] = []
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const call = callOf(input, init)
      log.push(call)
      if (call.kind === 'up') { clock += 10; return new Response(null, { status: 200 }) }
      clock += call.bytes === 1 ? 1 : 10
      return new Response(bodyOfSize(call.bytes), { headers: { 'content-length': String(call.bytes) } })
    })

    const result = resultOf(await runConnectionTest({ signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock }))

    // Rápido demais para ter amostra mínima (200 ms): só as métricas válidas ficam, e o resto é nulo, nunca zero.
    expect(result).toMatchObject({
      status: 'partial', reason: 'byte_limit', latencyMs: 1, jitterMs: 0, downloadMbps: null, uploadMbps: null,
      requestedBytes: CONNECTION_TEST_MAX_BYTES / 2, receivedBytes: CONNECTION_TEST_MAX_BYTES / 2,
      uploadRequestedBytes: CONNECTION_TEST_MAX_BYTES / 2, uploadSentBytes: CONNECTION_TEST_MAX_BYTES / 2,
    })
    const ups = log.filter((call) => call.kind === 'up')
    expect(ups.reduce((sum, call) => sum + call.bytes, 0)).toBe(75_000_000)
    expect(log.reduce((sum, call) => sum + call.bytes, 0)).toBe(CONNECTION_TEST_MAX_BYTES)
    expect(Math.max(...ups.map((call) => call.bytes))).toBeLessThanOrEqual(20_000_000)
    expect(ups.at(-1)?.bytes).toBeGreaterThan(0)
    const count = log.length
    await Promise.resolve()
    expect(log).toHaveLength(count)
  })

  it('U3 US1/AC4-AC5 FR-007/008/016: falha só do upload dá resultado parcial salvo com o download intacto, e falha total não tenta upload', async () => {
    let clock = 0
    let probes = 0
    const posts = vi.fn()
    const download = (call: Call) => {
      clock += call.bytes === 1 ? (probes++ === 0 ? 5 : (probes - 1) * 10) : 1000
      return new Response(bodyOfSize(call.bytes), { headers: { 'content-length': String(call.bytes) } })
    }
    const withUpload = (onUpload: () => Response) => vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = callOf(input, init)
      if (call.kind === 'up') { posts(); return onUpload() }
      return download(call)
    }) as typeof fetch

    for (const failing of [
      () => new Response('', { status: 405 }),
      () => { throw new TypeError('Failed to fetch https://speed.cloudflare.com/__up?token=segredo') },
    ]) {
      probes = 0; clock = 0
      const outcome = await runConnectionTest({ signal: new AbortController().signal, fetchImpl: withUpload(failing), monotonicNow: () => clock })
      const result = resultOf(outcome)
      expect(result).toMatchObject({ status: 'partial', reason: 'measurement_error', latencyMs: 45, jitterMs: 10, uploadMbps: null, uploadSamples: 0, uploadSentBytes: 0 })
      expect(result.downloadMbps).toBeCloseTo(8 * 26_000_000 / (3000 * 1000), 6)
      expect(JSON.stringify(outcome)).not.toMatch(/speed\.cloudflare|segredo|token|http/)
    }

    posts.mockClear()
    clock = 0
    const failAll: typeof fetch = vi.fn(async (input, init) => {
      if (new URL(String(input)).pathname === '/__up') posts()
      void init
      throw new TypeError('Failed to fetch')
    })
    expect(await runConnectionTest({ signal: new AbortController().signal, fetchImpl: failAll, monotonicNow: () => clock }))
      .toEqual({ state: 'failed', error: 'destination_unavailable' })
    expect(posts).not.toHaveBeenCalled()
  })

  it('U4 US1/AC2-AC3 e AC7 FR-009/010/012: o limite de tempo e o cancelamento no meio do upload abortam o envio, sem sobreposição nem retorno', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let clock = 0
    let probes = 0
    let active = 0
    let uploadStarted!: () => void
    let started = new Promise<void>((resolve) => { uploadStarted = resolve })
    const signals: AbortSignal[] = []
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const call = callOf(input, init)
      if (call.kind === 'down') {
        clock += call.bytes === 1 ? (probes++ === 0 ? 5 : (probes - 1) * 10) : 1000
        return new Response(bodyOfSize(call.bytes), { headers: { 'content-length': String(call.bytes) } })
      }
      const signal = init?.signal
      if (!signal) throw new Error('AbortSignal required')
      signals.push(signal)
      active += 1
      uploadStarted()
      // O envio nunca termina sozinho: só o aborto o encerra.
      return new Promise<Response>((_, reject) => {
        signal.addEventListener('abort', () => { active -= 1; reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
      })
    })
    const options = { fetchImpl, monotonicNow: () => clock }

    // 1) Limite de tempo no upload: parcial, com o download já medido preservado.
    const limited = runConnectionTest({ ...options, signal: new AbortController().signal })
    await Promise.race([started, limited.then(() => undefined, () => undefined)])
    clock += CONNECTION_TEST_MAX_MS
    await vi.advanceTimersByTimeAsync(CONNECTION_TEST_MAX_MS)
    const partial = resultOf(await limited)
    expect(partial).toMatchObject({ status: 'partial', reason: 'time_limit', uploadMbps: null, uploadSamples: 0, uploadSentBytes: 0, latencyMs: 45 })
    expect(partial.downloadMbps).not.toBeNull()
    expect(active).toBe(0)
    expect(signals.every((signal) => signal.aborted)).toBe(true)

    // 2) Cancelamento no meio do upload: outra execução é recusada, o envio aborta e nada volta depois.
    probes = 0
    started = new Promise<void>((resolve) => { uploadStarted = resolve })
    const cancel = new AbortController()
    const progress = vi.fn()
    const cancelled = runConnectionTest({ ...options, signal: cancel.signal, onProgress: progress })
    await started
    const callCount = vi.mocked(fetchImpl).mock.calls.length
    expect(await runConnectionTest({ ...options, signal: new AbortController().signal })).toEqual({ state: 'failed', error: 'busy' })
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(callCount)
    cancel.abort()
    expect(await cancelled).toEqual({ state: 'cancelled' })
    expect(active).toBe(0)
    const progressCount = progress.mock.calls.length
    await vi.advanceTimersByTimeAsync(CONNECTION_TEST_MAX_MS)
    expect(progress).toHaveBeenCalledTimes(progressCount)
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(callCount)

    // 3) Já cancelado antes de começar: zero rede.
    const preCancelled = new AbortController()
    preCancelled.abort()
    expect(await runConnectionTest({ ...options, signal: preCancelled.signal })).toEqual({ state: 'cancelled' })
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(callCount)
  })
})

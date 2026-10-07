import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSpeedTest } from './speedTest'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('speedTest — falhas e validade', () => {
  it('recusa 429 e nunca expõe a exceção de rede', async () => {
    const options = { signal: new AbortController().signal }
    expect(await runSpeedTest({ ...options, fetchImpl: vi.fn(async () => new Response(null, { status: 429 })) })).toEqual({ state: 'failed', error: 'rate_limited' })
    expect(await runSpeedTest({ ...options, fetchImpl: vi.fn(async () => { throw new Error('private details') }) })).toEqual({ state: 'failed', error: 'destination_unavailable' })
  })

  it('offline e signal já cancelado não fazem requisições', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const fetchImpl = vi.fn()
    expect(await runSpeedTest({ signal: new AbortController().signal, fetchImpl })).toEqual({ state: 'failed', error: 'offline' })
    const controller = new AbortController()
    controller.abort()
    expect(await runSpeedTest({ signal: controller.signal, fetchImpl })).toEqual({ state: 'cancelled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('corpo ausente, truncado ou excedente não vira medição', async () => {
    for (const body of [null, new Uint8Array(0), new Uint8Array(2)]) {
      const fetchImpl = vi.fn(async () => new Response(body))
      const outcome = await runSpeedTest({ signal: new AbortController().signal, fetchImpl })
      expect(outcome).toEqual({ state: 'failed', error: body === null ? 'stream_unsupported' : 'destination_unavailable' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('latência inválida não recebe zero; download pode sobreviver sozinho', async () => {
    let clock = 0
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const bytes = Number(new URL(String(input)).searchParams.get('bytes'))
      if (bytes > 1) clock += 1000
      return new Response(new Uint8Array(bytes))
    })
    const outcome = await runSpeedTest({ signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock })
    expect(outcome.state).toBe('completed')
    if (outcome.state !== 'completed') throw new Error('Expected download')
    expect(outcome.result).toMatchObject({ status: 'partial', latencyMs: null, jitterMs: null, latencySamples: 0 })
    expect(outcome.result.downloadMbps).toBeGreaterThan(0)
  })

  it('erro no corpo mantém reserva e conta recebido sem usar fragmento na velocidade', async () => {
    let clock = 0
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const bytes = Number(new URL(String(input)).searchParams.get('bytes'))
      clock += 10
      if (bytes === 1) return new Response(new Uint8Array(1))
      let emitted = false
      return new Response(new ReadableStream({ pull(controller) {
        if (emitted) controller.error(new Error('untrusted transport error'))
        else { emitted = true; controller.enqueue(new Uint8Array(1234)) }
      } }))
    })
    const outcome = await runSpeedTest({ signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock })
    expect(outcome.state).toBe('completed')
    if (outcome.state !== 'completed') throw new Error('Expected partial latency')
    expect(outcome.result).toMatchObject({ reason: 'measurement_error', requestedBytes: 1_000_009, receivedBytes: 1243, downloadMbps: null })
    expect(fetchImpl).toHaveBeenCalledTimes(10)
  })

  it('timeout sem métricas comunica amostra insuficiente e limpa o fetch', async () => {
    vi.useFakeTimers()
    let aborted = false
    const fetchImpl: typeof fetch = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }))
    const result = runSpeedTest({ signal: new AbortController().signal, fetchImpl })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await result).toEqual({ state: 'failed', error: 'insufficient_samples' })
    expect(aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})

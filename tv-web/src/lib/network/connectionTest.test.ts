import { afterEach, describe, expect, it, vi } from 'vitest'
import { runConnectionTest } from './connectionTest'
import type { SpeedTestProgress } from './speedTest'

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

/** Download sempre bem-sucedido (1 s por bloco); o envio é decidido por `onUpload`. */
function transport(onUpload: (body: Uint8Array) => Response | Promise<Response>) {
  const clock = { now: 0 }
  const bodies: Uint8Array[] = []
  let probes = 0
  const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/__up') {
      const body = init?.body as Uint8Array
      bodies.push(body)
      clock.now += 1000
      return onUpload(body)
    }
    const bytes = Number(url.searchParams.get('bytes'))
    clock.now += bytes === 1 ? (probes++ === 0 ? 5 : (probes - 1) * 10) : 1000
    return new Response(bodyOfSize(bytes), { headers: { 'content-length': String(bytes) } })
  })
  return { fetchImpl, clock, bodies }
}

afterEach(() => vi.unstubAllGlobals())

describe('runConnectionTest — complementos da feature 064', () => {
  it.each([1, -1])('registra a data no fim do upload com relógio civil variando em %i, sem afetar a duração', async (direction) => {
    const { fetchImpl, clock } = transport(() => new Response(null, { status: 200 }))
    const wallStart = 1_800_000_000_000
    const outcome = await runConnectionTest({
      signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock.now,
      wallClockNow: () => wallStart + direction * clock.now,
    })
    expect(outcome.state).toBe('completed')
    if (outcome.state !== 'completed') return
    expect(outcome.result.uploadSamples).toBe(3)
    expect(outcome.result.measuredAt).toBe(wallStart + direction * clock.now)
    expect(outcome.result.durationMs).toBe(6365)
  })

  it('HTTP 429 no envio dá resultado parcial (nunca "falhou") e mantém o download', async () => {
    const { fetchImpl, clock } = transport(() => new Response('', { status: 429 }))
    const outcome = await runConnectionTest({ signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock.now })
    expect(outcome.state).toBe('completed')
    if (outcome.state !== 'completed') return
    expect(outcome.result).toMatchObject({ status: 'partial', reason: 'measurement_error', uploadMbps: null, uploadSamples: 0 })
    expect(outcome.result.downloadMbps).toBeGreaterThan(0)
  })

  it('publica a etapa "upload" com os bytes confirmados crescendo, e nada depois do resultado', async () => {
    const { fetchImpl, clock } = transport(() => new Response(null, { status: 200 }))
    const seen: SpeedTestProgress[] = []
    const outcome = await runConnectionTest({
      signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock.now, onProgress: (progress) => { seen.push(progress) },
    })
    const count = seen.length
    await Promise.resolve()
    expect(seen).toHaveLength(count)
    const uploads = seen.filter((progress) => progress.stage === 'upload')
    expect(uploads.length).toBeGreaterThan(0)
    const sent = uploads.map((progress) => progress.sentBytes ?? -1)
    expect(sent).toEqual([...sent].sort((a, b) => a - b))
    expect(sent.at(-1)).toBe(26_000_000)
    expect(seen.filter((progress) => progress.stage !== 'upload').every((progress) => progress.sentBytes === undefined)).toBe(true)
    // As etapas de download vêm todas antes das de upload.
    const firstUpload = seen.findIndex((progress) => progress.stage === 'upload')
    expect(seen.slice(firstUpload).every((progress) => progress.stage === 'upload')).toBe(true)
    expect(outcome.state).toBe('completed')
  })

  it('o corpo é um Uint8Array do tamanho pedido, gerado pelo app, e funciona sem crypto.getRandomValues', async () => {
    for (const withCrypto of [true, false]) {
      if (!withCrypto) vi.stubGlobal('crypto', undefined)
      const { fetchImpl, clock, bodies } = transport(() => new Response(null, { status: 200 }))
      const outcome = await runConnectionTest({ signal: new AbortController().signal, fetchImpl, monotonicNow: () => clock.now })
      expect(outcome.state).toBe('completed')
      expect(bodies.map((body) => body.byteLength)).toEqual([1_000_000, 5_000_000, 20_000_000])
      expect(bodies.every((body) => body instanceof Uint8Array)).toBe(true)
      expect(new Set(bodies[0].subarray(0, 4096)).size).toBeGreaterThan(1)
      vi.unstubAllGlobals()
    }
  })

  it('uma segunda execução durante a primeira etapa também é recusada, sem rede nova', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const calls = vi.fn()
    const fetchImpl: typeof fetch = vi.fn(async (_input, init) => {
      calls()
      await gate
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return new Response(bodyOfSize(1), { headers: { 'content-length': '1' } })
    })
    const controller = new AbortController()
    const first = runConnectionTest({ signal: controller.signal, fetchImpl })
    await Promise.resolve()
    const before = calls.mock.calls.length
    expect(await runConnectionTest({ signal: new AbortController().signal, fetchImpl })).toEqual({ state: 'failed', error: 'busy' })
    expect(calls.mock.calls).toHaveLength(before)
    controller.abort()
    release()
    expect(await first).toEqual({ state: 'cancelled' })
  })
})

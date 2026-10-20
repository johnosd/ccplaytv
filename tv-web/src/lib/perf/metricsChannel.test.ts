import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMetricsChannel, emitMetric, metricsDestination, METRICS_SCHEMA } from './metricsChannel'

const DESTINATION = 'http://192.168.0.10:8770/app-metrics'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('canal de métricas (feature 085)', () => {
  it('o lote enviado tem schema, sentAt e as linhas já saneadas', async () => {
    const send = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const channel = createMetricsChannel({ destination: DESTINATION, fetchImpl: send })
    channel.emit({ source: 'section-load', kind: 'movie', totalMs: 9000, name: 'não sai' })
    await channel.flush()
    expect(send).toHaveBeenCalledTimes(1)
    const [url, init] = send.mock.calls[0]
    expect(String(url)).toBe(DESTINATION)
    expect(init?.method).toBe('POST')
    const body = JSON.parse(String(init?.body))
    expect(body.schema).toBe(METRICS_SCHEMA)
    expect(typeof body.sentAt).toBe('number')
    expect(body.lines).toEqual([{ source: 'section-load', kind: 'movie', totalMs: 9000 }])
  })

  it('ao passar de maxQueue descarta a mais antiga', async () => {
    const send = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const channel = createMetricsChannel({ destination: DESTINATION, fetchImpl: send, maxQueue: 2 })
    for (const slow of [1, 2, 3]) channel.emit({ source: 'frames', slow })
    await channel.flush()
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).lines.map((line: { slow: number }) => line.slow)).toEqual([2, 3])
  })

  it('o envio é agendado sozinho (~2 s) e junta várias linhas num pedido', async () => {
    vi.useFakeTimers()
    const send = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const channel = createMetricsChannel({ destination: DESTINATION, fetchImpl: send })
    channel.emit({ source: 'frames', slow: 1 })
    channel.emit({ source: 'frames', slow: 2 })
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2100)
    expect(send).toHaveBeenCalledTimes(1)
    expect(channel.pending()).toBe(0)
  })

  it('destino: só http em máquina local, caminho exato, sem usuário/senha/query/hash', () => {
    expect(metricsDestination(DESTINATION)?.href).toBe(DESTINATION)
    expect(metricsDestination('http://localhost:8770/app-metrics')).not.toBeNull()
    expect(metricsDestination('http://127.0.0.1:8770/app-metrics')).not.toBeNull()
    for (const bad of [
      undefined, '', 'nao-e-url', 'https://192.168.0.10:8770/app-metrics', 'http://example.com/app-metrics',
      'http://192.168.0.10:8770/app-metrics?x=1', 'http://192.168.0.10:8770/app-metrics#a',
      'http://usuario:senha@192.168.0.10:8770/app-metrics', 'http://192.168.0.10:8770/app-metrics/', 'http://10.0.0.1:8770/app-metrics',
    ]) expect(metricsDestination(bad)).toBeNull()
  })

  it('emitMetric sem a variável do build de medição é no-op (nunca chama fetch)', () => {
    const send = vi.spyOn(globalThis, 'fetch')
    vi.stubEnv('VITE_CCPLAY_METRICS_REPORT', '')
    emitMetric({ source: 'frames', slow: 1 })
    expect(send).not.toHaveBeenCalled()
    send.mockRestore()
  })
})

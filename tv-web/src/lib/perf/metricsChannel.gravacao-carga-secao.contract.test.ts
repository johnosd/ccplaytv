// Contrato da feature 085 (US3) — travado pelo sdd-plan; o sdd-execute só pode fazê-lo passar.
import { describe, expect, it, vi } from 'vitest'
import { createMetricsChannel, sanitizeMetricLine } from './metricsChannel'

describe('canal de métricas do app real (085)', () => {
  // FR-012 / Constitution: Segredos Fora dos Clientes e dos Logs
  it('só números e rótulos fixos saem: texto do provedor, URL e estruturas são descartados', () => {
    const line = sanitizeMetricLine({
      source: 'section-load',
      kind: 'movie',
      outcome: 'done',
      readMs: 3764.2,
      items: 43510,
      name: 'Filme do Provedor (2024)',
      category: 'Lançamentos 4K',
      url: 'http://painel.exemplo/movie/usuario/senha/1.mp4',
      nested: { a: 1 },
      list: [1, 2],
      bad: Number.NaN,
      infinite: Number.POSITIVE_INFINITY,
    })
    expect(line).toEqual({ source: 'section-load', kind: 'movie', outcome: 'done', readMs: 3764.2, items: 43510 })
    expect(sanitizeMetricLine({ source: 'Canal do Provedor', readMs: 1 })).toBeNull()
  })

  // FR-010 / FR-013
  it('sem destino válido nada é enviado; com o coletor fora do ar a fila é limitada e a falha é silenciosa', async () => {
    const idle = vi.fn<typeof fetch>()
    for (const destination of [undefined, '', 'https://coletor.exemplo.com/app-metrics', 'http://192.168.0.10:8770/outro']) {
      const channel = createMetricsChannel({ destination, fetchImpl: idle })
      channel.emit({ source: 'frames', slow: 3 })
      await channel.flush()
    }
    expect(idle).not.toHaveBeenCalled()

    const down = vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch') })
    const channel = createMetricsChannel({ destination: 'http://192.168.0.10:8770/app-metrics', fetchImpl: down, maxQueue: 3 })
    for (let i = 0; i < 10; i += 1) channel.emit({ source: 'frames', slow: i })
    expect(channel.pending()).toBeLessThanOrEqual(3)
    await expect(channel.flush()).resolves.toBeUndefined()
    expect(down).toHaveBeenCalled()
    expect(channel.pending()).toBe(0)
  })
})

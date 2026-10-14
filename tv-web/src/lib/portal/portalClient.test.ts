import { describe, expect, it, vi } from 'vitest'
import { createPortalClient } from './portalClient'

describe('transporte do portal', () => {
  it('recusa origens/rotas que poderiam desviar segredos e permite localhost explícito', async () => {
    for (const origin of ['http://example.test', 'https://user:pass@example.test',
      'https://example.test/private', 'https://example.test/?token=secret']) {
      expect(() => createPortalClient({ origin })).toThrow('invalid_input')
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    const client = createPortalClient({ origin: 'http://127.0.0.1:5174', allowLocalHttp: true, fetch: fetcher })
    for (const path of ['https://other.test', '/portal/v1//evil', '/portal/v1/device?key=private']) {
      await expect(client.request(path, {})).rejects.toThrow('invalid_input')
    }
    await client.request('/portal/v1/device/snapshot', { method: 'PUT', bearer: 'fixture-private', body: { revision: 1 } })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:5174/portal/v1/device/snapshot')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error',
      cache: 'no-store', headers: { Authorization: 'Bearer fixture-private' } })
  })

  it('sanitiza exceções/corpos e conserva Retry-After sem ecoar proxy', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(Error('https://private-provider.test/user/password'))
      .mockResolvedValueOnce(new Response('private-body', { status: 429, headers: { 'Retry-After': '900' } }))
      .mockResolvedValueOnce(new Response('private-invalid-json'))
    const client = createPortalClient({ origin: 'https://portal.example.test', fetch: fetcher })
    await expect(client.request('/portal/v1/device/trial', {})).rejects.toThrow('network_error')
    await expect(client.request('/portal/v1/device/trial', {})).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 900_000 })
    await expect(client.request('/portal/v1/device/trial', {})).rejects.toThrow('network_error')
  })

  it('limita resposta antes do parse e mantém sinal de cancelamento', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(1_048_577)))
    const client = createPortalClient({ origin: 'https://portal.example.test', fetch: fetcher })
    const abort = new AbortController()
    await expect(client.request('/portal/v1/device/trial', { signal: abort.signal })).rejects.toThrow('service_unavailable')
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
})

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

  // 081/T044: Pix desligado (409) e Pix que falhou agora (503) vêm do corpo; outro 503 continua genérico.
  it('lê pix_disabled e pix_failed do corpo curto do serviço e ignora corpo de proxy', async () => {
    const json = (status: number, code: string) => new Response(JSON.stringify({ code, retryable: status === 503 }), { status })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(409, 'pix_disabled'))
      .mockResolvedValueOnce(json(503, 'pix_failed'))
      .mockResolvedValueOnce(json(503, 'service_unavailable'))
      .mockResolvedValueOnce(new Response('<html>pix_failed</html>', { status: 503 }))
    const client = createPortalClient({ origin: 'https://portal.example.test', fetch: fetcher })
    for (const code of ['pix_disabled', 'pix_failed', 'service_unavailable', 'service_unavailable'])
      await expect(client.request('/portal/v1/device/orders/pix', {})).rejects.toMatchObject({ code })
  })

  it('limita resposta antes do parse e mantém sinal de cancelamento', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(1_048_577)))
    const client = createPortalClient({ origin: 'https://portal.example.test', fetch: fetcher })
    const abort = new AbortController()
    await expect(client.request('/portal/v1/device/trial', { signal: abort.signal })).rejects.toThrow('service_unavailable')
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
})

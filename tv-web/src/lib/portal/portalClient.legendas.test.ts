import { expect, it } from 'vitest'
import { createPortalClient, PortalRequestError } from './portalClient'

// 090: os códigos de legenda vêm do corpo, inclusive no 429 (limite da TV × anti-abuso); o resto não muda.
const reply = (status: number, body: string, headers: Record<string, string> = {}) => async () =>
  new Response(body, { status, headers: { 'Content-Type': 'application/json', ...headers } })

async function errorOf(status: number, body: string, headers?: Record<string, string>) {
  const client = createPortalClient({ origin: 'https://portal.test', fetch: reply(status, body, headers) as never })
  try {
    await client.request('/portal/v1/device/subtitles/search', { body: {} })
  } catch (error) {
    return error as PortalRequestError
  }
  throw new Error('esperava falha')
}

it('lê os códigos de legenda do corpo em 409/429/503 e mantém o mapeamento por status sem eles', async () => {
  expect((await errorOf(409, '{"code":"subtitles_not_entitled"}')).code).toBe('subtitles_not_entitled')
  expect((await errorOf(409, '{"code":"subtitles_unreadable"}')).code).toBe('subtitles_unreadable')
  const limit = await errorOf(429, '{"code":"subtitles_device_limit"}', { 'Retry-After': '3600' })
  expect(limit.code).toBe('subtitles_device_limit')
  expect(limit.retryAfterMs).toBe(3_600_000)
  expect((await errorOf(429, '{"code":"rate_limited"}')).code).toBe('rate_limited')
  expect((await errorOf(429, '<html>proxy</html>')).code).toBe('rate_limited')
  expect((await errorOf(503, '{"code":"subtitles_provider_limit"}')).code).toBe('subtitles_provider_limit')
  expect((await errorOf(503, '{"code":"api_key=vazada"}')).code).toBe('service_unavailable')
})

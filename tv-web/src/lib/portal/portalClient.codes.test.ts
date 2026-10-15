import { expect, it } from 'vitest'
import { createPortalClient, PortalRequestError } from './portalClient'

// 072: o enroll recusado precisa chegar como `recovery_required` (não `conflict`) para a TV se reassociar.
const reply = (status: number, body: string) => async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } })

async function codeOf(status: number, body: string) {
  const client = createPortalClient({ origin: 'https://portal.test', fetch: reply(status, body) as never })
  try { await client.request('/portal/v1/devices/enroll', { body: {} }) } catch (error) { return (error as PortalRequestError).code }
  return 'ok'
}

it('lê só recovery_required/invalid_credentials do corpo; o resto segue o status e nada do corpo é ecoado', async () => {
  expect(await codeOf(409, '{"code":"recovery_required","retryable":false}')).toBe('recovery_required')
  expect(await codeOf(401, '{"code":"invalid_credentials","retryable":false}')).toBe('invalid_credentials')
  expect(await codeOf(401, '{"code":"unauthorized"}')).toBe('unauthorized')
  expect(await codeOf(409, '<html>proxy</html>')).toBe('conflict')
  expect(await codeOf(409, '{"code":"senha-vazada"}')).toBe('conflict')
  expect(await codeOf(404, '{"code":"not_found"}')).toBe('not_found')
})

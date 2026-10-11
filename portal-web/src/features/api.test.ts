import { afterEach, expect, it, vi } from 'vitest'
import { api, newOperationId, PortalApiError, takeInvite } from './api'
afterEach(() => vi.unstubAllGlobals())
it('remove fragmento antes da rede e valida convite sem guardar credenciais', () => {
  const history = { replaceState: vi.fn() }
  const token = 'a'.repeat(43)
  expect(takeInvite({ hash: '#invite=' + token, pathname: '/', search: '' }, history)).toBe(token)
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
  expect(takeInvite({ hash: '#invite=invalid', pathname: '/', search: '' }, history)).toBeUndefined()
  expect(newOperationId(1791720000000)).toMatch(/^op-1791720000000-[A-Za-z0-9_-]{43}$/)
  expect(newOperationId()).not.toBe(newOperationId())
})
it('sanitiza fetch e corpo de erro, usa same-origin/no-store sem query secreta', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('https://private.invalid/password=fixture'))
  vi.stubGlobal('fetch', fetcher)
  await expect(api.manual('tv', 'fixture-key')).rejects.toEqual(new PortalApiError('network'))
  expect(fetcher.mock.calls[0][0]).toBe('/portal/v1/sessions/manual')
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
  fetcher.mockResolvedValue(new Response('private-fixture', { status: 429, headers: { 'Retry-After': '10' } }))
  await expect(api.manual('tv', 'fixture-key')).rejects.toEqual(new PortalApiError('limited', 10))
})
it('logout204 funciona e paginação segue apenas cursor opaco', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetcher)
  await api.logout({ deviceId: 'tv', csrfToken: 'csrf', expiresAt: '' })
  fetcher.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('/snapshot')
    ? { snapshot: null, stale: true } : url.includes('/configurations')
      ? { configurations: [], nextAfter: null } : { operations: [], nextAfter: null })))
  expect(await api.dashboard()).toEqual({ configurations: [], operations: [], snapshot: null, stale: true })
  fetcher.mockResolvedValue(new Response(JSON.stringify({ configurations: [], nextAfter: 'https://private.invalid' })))
  await expect(api.dashboard()).rejects.toBeInstanceOf(PortalApiError)
})

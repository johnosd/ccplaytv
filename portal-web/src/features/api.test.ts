import { afterEach, expect, it, vi } from 'vitest'
import { api, newOperationId, PortalApiError, rememberSession, storedSession, takeEntry, takeInvite } from './api'
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
it('lê valores salvos somente por sourceId opaco e mantém a URL sem dados da lista', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'm3u_url', displayName: 'Lista',
    m3uUrl: 'https://provider.invalid/list?secret=fixture' })))
  vi.stubGlobal('fetch', fetcher)
  await expect(api.values('source-safe')).resolves.toMatchObject({ type: 'm3u_url', displayName: 'Lista' })
  expect(fetcher.mock.calls[0][0]).toBe('/portal/v1/configurations/source-safe/values')
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' })
  expect(() => api.values('../private')).toThrow(new PortalApiError('invalid'))
})

it('QR fixo: lê #id=&key=, limpa o endereço antes da rede e recusa fragmento inválido ou ambíguo sem ecoá-lo', async () => {
  const history = { replaceState: vi.fn() }
  const where = (hash: string) => ({ hash, pathname: '/', search: '' })
  expect(takeEntry(where('#id=a0-8c-fd-19-0a-8c&key=0123456789'), history))
    .toEqual({ kind: 'device', displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '0123456789' })
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
  expect(takeEntry(where('#id=A0:8C:FD:19:0A:8C&key=123'), history)).toBeUndefined()
  expect(takeEntry(where('#id=nao-e-mac&key=0123456789'), history)).toBeUndefined()
  expect(takeEntry(where('#id=A0:8C:FD:19:0A:8C&key=0123456789&invite=' + 'a'.repeat(43)), history)).toBeUndefined()
  expect(history.replaceState).toHaveBeenCalledTimes(4)

  // Chave errada: a recusa é a mesma de qualquer entrada manual e a URL da requisição não leva dados.
  const fetcher = vi.fn().mockResolvedValue(new Response('private-fixture', { status: 401 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(api.manual('A0:8C:FD:19:0A:8C', '0000000000')).rejects.toEqual(new PortalApiError('access'))
  expect(fetcher.mock.calls[0][0]).toBe('/portal/v1/sessions/manual')
})
it('sessão da aba: guarda só ID/CSRF/validade, descarta vencida ou malformada e limpa no logout (T034)', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const session = { deviceId: 'device-a', csrfToken: 'c'.repeat(43), expiresAt: new Date(2_000_000).toISOString() }
  rememberSession(session, storage)
  expect(storedSession(storage, 1_000_000)).toEqual(session)
  expect(storedSession(storage, 3_000_000)).toBeUndefined()
  expect(values.size).toBe(0)
  values.set('ccplay-portal-session', JSON.stringify({ ...session, csrfToken: 'curto' }))
  expect(storedSession(storage, 1_000_000)).toBeUndefined()
  rememberSession({ ...session, recoveryCode: '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV' } as typeof session, storage)
  expect(JSON.parse(values.get('ccplay-portal-session')!)).toEqual(session)
  rememberSession(undefined, storage)
  expect(values.size).toBe(0)
})

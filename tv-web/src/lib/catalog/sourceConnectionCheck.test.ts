import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkSourceConnection } from './sourceConnectionCheck'

const PANEL = { type: 'provider_credentials', dns: 'http://painel.exemplo.test:8080', username: 'joao', password: 'segredo' } as const
const M3U_OK = '#EXTM3U\n#EXTINF:-1 group-title="Canais",Canal Um\nhttp://painel.exemplo.test/live/1.ts\n'
const ACCOUNT_OK = JSON.stringify({ user_info: { auth: 1, exp_date: null } })

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('checkSourceConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('limite de tempo: um fetch que ignora o sinal vira NET-02', async () => {
    vi.useFakeTimers()
    stubFetch(() => new Promise<Response>(() => {}))
    const pending = checkSourceConnection(PANEL, { timeoutMs: 15_000 })
    await vi.advanceTimersByTimeAsync(15_001)
    expect(await pending).toEqual({ status: 'failed', code: 'NET-02' })
  })

  it('sinal abortado por quem chamou vira cancelled, antes e durante a espera', async () => {
    const early = new AbortController()
    early.abort()
    expect(await checkSourceConnection(PANEL, { signal: early.signal })).toEqual({ status: 'cancelled' })

    stubFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const during = new AbortController()
    const pending = checkSourceConnection(PANEL, { signal: during.signal })
    await Promise.resolve()
    during.abort()
    expect(await pending).toEqual({ status: 'cancelled' })
  })

  it('painel reconhecido por URL M3U (get.php): confirma, recusa e expira', async () => {
    const url = 'http://painel.exemplo.test:8080/get.php?username=joao&password=segredo&type=m3u_plus'
    stubFetch(() => Promise.resolve(new Response(ACCOUNT_OK)))
    expect(await checkSourceConnection({ type: 'm3u_url', url })).toEqual({ status: 'confirmed', route: 'xtream' })

    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ user_info: { auth: 0 } }))))
    expect(await checkSourceConnection({ type: 'm3u_url', url })).toEqual({ status: 'failed', code: 'SRC-401' })

    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ user_info: { auth: 1, exp_date: '1000000000' } }))))
    expect(await checkSourceConnection({ type: 'm3u_url', url })).toEqual({ status: 'failed', code: 'SRC-402' })
  })

  it('429 do painel vira API-429', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 429 })))
    expect(await checkSourceConnection(PANEL)).toEqual({ status: 'failed', code: 'API-429' })
  })

  it('lista avulsa: M3U válido confirma; manifesto HLS, vazio e HTML são SRC-422; 403 é SRC-401', async () => {
    const url = 'http://lista.exemplo.test/lista.m3u'
    stubFetch(() => Promise.resolve(new Response(M3U_OK)))
    expect(await checkSourceConnection({ type: 'm3u_url', url })).toEqual({ status: 'confirmed', route: 'm3u' })

    stubFetch(() => Promise.resolve(new Response('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nseg1.ts\n')))
    expect(await checkSourceConnection({ type: 'm3u_url', url })).toEqual({ status: 'failed', code: 'SRC-422' })

    stubFetch(() => Promise.resolve(new Response('#EXTM3U\n')))
    expect(await checkSourceConnection({ type: 'm3u_url', url })).toEqual({ status: 'failed', code: 'SRC-422' })

    stubFetch(() => Promise.resolve(new Response('<html></html>')))
    expect(await checkSourceConnection({ type: 'm3u_url', url })).toEqual({ status: 'failed', code: 'SRC-422' })

    stubFetch(() => Promise.resolve(new Response('', { status: 403 })))
    expect(await checkSourceConnection({ type: 'm3u_url', url })).toEqual({ status: 'failed', code: 'SRC-401' })
  })

  it('URL M3U com usuário/senha embutidos, ou que não é http(s), é SRC-001 sem rede', async () => {
    const never = stubFetch(() => Promise.reject(new Error('sem rede')))
    expect(await checkSourceConnection({ type: 'm3u_url', url: 'http://u:p@lista.exemplo.test/x.m3u' })).toEqual({
      status: 'failed',
      code: 'SRC-001',
    })
    expect(await checkSourceConnection({ type: 'm3u_url', url: 'ftp://lista.exemplo.test/x.m3u' })).toEqual({
      status: 'failed',
      code: 'SRC-001',
    })
    expect(never).not.toHaveBeenCalled()
  })

  it('com o aparelho online, uma lista que falha por rede é NET-02 (não NET-01)', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await checkSourceConnection({ type: 'm3u_url', url: 'http://lista.exemplo.test/x.m3u' }, { isOnline: () => true })).toEqual({
      status: 'failed',
      code: 'NET-02',
    })
  })
})

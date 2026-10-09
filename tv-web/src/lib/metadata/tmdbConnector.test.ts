import { describe, expect, it, vi } from 'vitest'
import { detectKeyFormat, tmdbAuthenticate, tmdbGet, tmdbImageUrl, TmdbError } from './tmdbConnector'

const V3 = '0123456789abcdef0123456789abcdef'
const V4 = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.assinatura_teste-1'

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('detectKeyFormat', () => {
  it('reconhece v3 (32 hex) e v4 (JWT) e recusa o resto, aparando espaços', () => {
    expect(detectKeyFormat(`  ${V3}  `)).toBe('v3')
    expect(detectKeyFormat(V4)).toBe('v4')
    expect(detectKeyFormat('curta')).toBeUndefined()
    expect(detectKeyFormat(`${V3}zz`)).toBeUndefined()
    expect(detectKeyFormat('')).toBeUndefined()
  })
})

describe('tmdbGet', () => {
  it('v3 vai na query api_key, sem cabeçalho de autorização', async () => {
    const fetchImpl = vi.fn(async () => response(200, { ok: true }))
    await tmdbGet('/movie/603', { language: 'pt-BR' }, { key: V3, format: 'v3' }, fetchImpl as unknown as typeof fetch)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://api.themoviedb.org/3/movie/603')
    expect(parsed.searchParams.get('api_key')).toBe(V3)
    expect(parsed.searchParams.get('language')).toBe('pt-BR')
    expect(init.headers).toBeUndefined()
  })

  it('v4 vai no cabeçalho Bearer, sem api_key na URL', async () => {
    const fetchImpl = vi.fn(async () => response(200, {}))
    await tmdbGet('/movie/1', {}, { key: V4, format: 'v4' }, fetchImpl as unknown as typeof fetch)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).searchParams.has('api_key')).toBe(false)
    expect(init.headers).toEqual({ Authorization: `Bearer ${V4}` })
  })

  it.each([
    [401, 'refused'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'offline'],
  ])('status %i vira a categoria %s, sem a chave na mensagem', async (status, kind) => {
    const fetchImpl = vi.fn(async () => response(status))
    const error = await tmdbGet('/x', {}, { key: V3, format: 'v3' }, fetchImpl as unknown as typeof fetch).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TmdbError)
    expect((error as TmdbError).kind).toBe(kind)
    expect(String((error as TmdbError).message)).not.toContain(V3)
  })

  it('falha de rede vira "offline" sem repassar a mensagem do fetch (que carrega a URL com a chave)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(`Failed to fetch https://api.themoviedb.org/3/x?api_key=${V3}`)
    })
    const error = await tmdbGet('/x', {}, { key: V3, format: 'v3' }, fetchImpl as unknown as typeof fetch).catch((e: unknown) => e)
    expect((error as TmdbError).kind).toBe('offline')
    expect(String((error as TmdbError).message)).not.toContain(V3)
  })

  it('encerra corpo que nunca termina e converte JSON inválido em offline sanitizado', async () => {
    let signal: AbortSignal | null | undefined
    const pendingBody = vi.fn(() => new Promise<unknown>(() => {}))
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal
      return { status: 200, ok: true, headers: new Headers(), json: pendingBody } as unknown as Response
    })

    const timeout = await tmdbGet('/movie/1', {}, { key: V3, format: 'v3' }, fetchImpl as unknown as typeof fetch, { timeoutMs: 10 })
      .catch((error: unknown) => error)
    expect(timeout).toBeInstanceOf(TmdbError)
    expect((timeout as TmdbError).kind).toBe('offline')
    expect(signal?.aborted).toBe(true)

    const invalid = await tmdbGet(
      '/movie/2',
      {},
      { key: V3, format: 'v3' },
      (async () => new Response('{invalid', { status: 200 })) as unknown as typeof fetch,
    ).catch((error: unknown) => error)
    expect(invalid).toBeInstanceOf(TmdbError)
    expect((invalid as TmdbError).kind).toBe('offline')
    expect(String((invalid as TmdbError).message)).not.toContain(V3)
  })

  it('preserva Retry-After numérico/data futuro e ignora valor inválido ou passado', async () => {
    const now = Date.UTC(2026, 9, 8, 12)
    const run = async (retryAfter: string) => {
      const error = await tmdbGet(
        '/movie/3',
        {},
        { key: V3, format: 'v3' },
        (async () => new Response('{}', { status: 429, headers: { 'Retry-After': retryAfter } })) as unknown as typeof fetch,
        { now: () => now },
      ).catch((value: unknown) => value)
      return error as TmdbError
    }

    expect((await run('12.5')).retryAfterMs).toBe(12_500)
    const future = new Date(now + 42_000).toUTCString()
    expect((await run(future)).retryAfterMs).toBeGreaterThanOrEqual(41_000)
    expect((await run(future)).retryAfterMs).toBeLessThanOrEqual(42_000)
    expect((await run('0')).retryAfterMs).toBe(0)
    expect((await run('ontem')).retryAfterMs).toBeUndefined()
    expect((await run(new Date(now - 42_000).toUTCString())).retryAfterMs).toBeUndefined()
  })
})

describe('tmdbAuthenticate e imagem', () => {
  it('só aceita success:true', async () => {
    await expect(
      tmdbAuthenticate({ key: V3, format: 'v3' }, (async () => response(200, { success: true })) as unknown as typeof fetch),
    ).resolves.toBeUndefined()
    await expect(
      tmdbAuthenticate({ key: V3, format: 'v3' }, (async () => response(200, { success: false })) as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: 'refused' })
  })

  it('a URL da imagem não leva chave', () => {
    expect(tmdbImageUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w1280/abc.jpg')
    expect(tmdbImageUrl('abc.jpg')).toBe('https://image.tmdb.org/t/p/w1280/abc.jpg')
  })
})

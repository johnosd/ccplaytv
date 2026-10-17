import { describe, expect, it, vi } from 'vitest'
import { createRadioDirectory, RadioDirectoryError } from './radioDirectory'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const STATION = { stationuuid: 'u1', name: 'Um', url_resolved: 'https://s.example/1', countrycode: 'BR' }

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>

function fakeFetch(route: Route) {
  const calls: { url: string; init?: RequestInit }[] = []
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return route(url, init)
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

function healthyMirror(name: string, data: Route): Route {
  return (url, init) => {
    if (url === 'https://all.api.radio-browser.info/json/servers') return json([{ name }])
    if (url === `https://${name}/json/stats`) return json({ status: 'OK' })
    return data(url, init)
  }
}

async function failureOf(promise: Promise<unknown>): Promise<RadioDirectoryError> {
  return promise.then(
    () => {
      throw new Error('esperava falha')
    },
    (error: unknown) => error as RadioDirectoryError,
  )
}

describe('radioDirectory', () => {
  it('mundo: a busca não leva countrycode', async () => {
    const { impl, calls } = fakeFetch(healthyMirror('m1.api.radio-browser.info', () => json([STATION])))
    await createRadioDirectory({ fetchImpl: impl, random: () => 0 }).listStations({ countryCode: null })
    const search = new URL(calls.find((call) => call.url.includes('/stations/search'))!.url)
    expect(search.searchParams.has('countrycode')).toBe(false)
    expect(search.searchParams.get('limit')).toBe('100')
  })

  it('sem lista de espelhos, usa o de1', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.includes('all.api')) throw new TypeError('rede')
      return json([STATION])
    })
    await createRadioDirectory({ fetchImpl: impl }).listStations({ countryCode: 'BR' })
    expect(calls.at(-1)!.url.startsWith('https://de1.api.radio-browser.info/json/stations/search')).toBe(true)
  })

  it('falha de rede pelo espelho redescobre uma vez e repete', async () => {
    let searches = 0
    const { impl } = fakeFetch(
      healthyMirror('m1.api.radio-browser.info', () => {
        searches += 1
        if (searches === 1) throw new TypeError('caiu')
        return json([STATION])
      }),
    )
    const stations = await createRadioDirectory({ fetchImpl: impl, random: () => 0 }).listStations({ countryCode: 'BR' })
    expect(stations).toHaveLength(1)
    expect(searches).toBe(2)
  })

  it('duas falhas seguidas viram offline, sem URL na mensagem', async () => {
    const { impl } = fakeFetch(healthyMirror('m1.api.radio-browser.info', () => json({}, 503)))
    const error = await failureOf(createRadioDirectory({ fetchImpl: impl, random: () => 0 }).listCountries())
    expect(error.kind).toBe('offline')
    expect(error.message).toBe('radio:offline')
  })

  it.each([
    [401, 'refused'],
    [403, 'refused'],
    [429, 'rate_limited'],
  ] as const)('status %i → %s', async (status, kind) => {
    const { impl } = fakeFetch(healthyMirror('m1.api.radio-browser.info', () => json({}, status)))
    const error = await failureOf(createRadioDirectory({ fetchImpl: impl, random: () => 0 }).listCountries())
    expect(error.kind).toBe(kind)
  })

  it('objeto em vez de lista é bad_response', async () => {
    const { impl } = fakeFetch(healthyMirror('m1.api.radio-browser.info', () => json({ items: [] })))
    const error = await failureOf(createRadioDirectory({ fetchImpl: impl, random: () => 0 }).listCountries())
    expect(error.kind).toBe('bad_response')
  })

  it('byuuid manda os uuids juntos e devolve só os que existem', async () => {
    const { impl, calls } = fakeFetch(healthyMirror('m1.api.radio-browser.info', () => json([STATION])))
    const directory = createRadioDirectory({ fetchImpl: impl, random: () => 0 })
    expect(await directory.stationsByUuid([])).toEqual([])
    const found = await directory.stationsByUuid(['u1', 'gone'])
    expect(found.map((station) => station.uuid)).toEqual(['u1'])
    expect(new URL(calls.at(-1)!.url).searchParams.get('uuids')).toBe('u1,gone')
  })

  it('reportClick faz POST no espelho e nunca lança', async () => {
    const { impl, calls } = fakeFetch(
      healthyMirror('m1.api.radio-browser.info', (url) => {
        if (url.includes('/json/url/')) throw new TypeError('sem rede')
        return json([])
      }),
    )
    const directory = createRadioDirectory({ fetchImpl: impl, random: () => 0 })
    expect(() => directory.reportClick('a b')).not.toThrow()
    await vi.waitFor(() => expect(calls.some((call) => call.url.endsWith('/json/url/a%20b'))).toBe(true))
    expect(calls.find((call) => call.url.endsWith('/json/url/a%20b'))!.init?.method).toBe('POST')
  })

  it('normaliza tags, bitrate, hls, país e descarta favicon/URL inseguros', async () => {
    const raw = {
      ...STATION,
      tags: ' pop , ,rock,a,b,c,d',
      bitrate: '96',
      hls: 1,
      countrycode: 'xx-1',
      favicon: 'javascript:alert(1)',
      clickcount: 'x',
    }
    const insecure = { ...STATION, stationuuid: 'u2', url_resolved: 'https://user:pass@s.example/2' }
    const { impl } = fakeFetch(healthyMirror('m1.api.radio-browser.info', () => json([raw, insecure])))
    const [station, ...rest] = await createRadioDirectory({ fetchImpl: impl, random: () => 0 }).listStations({ countryCode: 'BR' })
    expect(rest).toHaveLength(0)
    expect(station.tags).toEqual(['pop', 'rock', 'a', 'b', 'c'])
    expect(station.bitrate).toBe(96)
    expect(station.hls).toBe(true)
    expect(station.countryCode).toBe('')
    expect(station.artUrl).toBeUndefined()
    expect(station.popularity).toBe(0)
  })

  it('abortar pelo sinal relança AbortError, sem virar categoria', async () => {
    const { impl } = fakeFetch(
      healthyMirror('m1.api.radio-browser.info', (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })))
      })),
    )
    const controller = new AbortController()
    const pending = createRadioDirectory({ fetchImpl: impl, random: () => 0 }).listStations({ countryCode: 'BR' }, controller.signal)
    await vi.waitFor(() => expect(impl).toHaveBeenCalledTimes(3))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

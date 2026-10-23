import { describe, expect, it, vi } from 'vitest'
import { PortalRequestError } from '../portal/portalClient'
import { createPortalSubtitleService, type SubtitleServiceConnection } from './portalSubtitleService'
import { SubtitleError } from './types'

function fakeConnection(response: unknown | (() => unknown)) {
  const request = vi.fn(async () => (typeof response === 'function' ? (response as () => unknown)() : response))
  const connection: SubtitleServiceConnection = { ready: async () => ({ bearer: 'tv-bearer' }), client: { request } as never }
  return { connection, request }
}

const signal = new AbortController().signal
const GOOD = {
  id: 'os:9001', provider: 'opensubtitles', language: 'pt-BR', release: 'Matrix.1999', downloads: 10, hearingImpaired: false,
}

describe('createPortalSubtitleService (feature 090)', () => {
  it('envia o pedido exato pela rota fixa e só acrescenta `providers` quando pedido', async () => {
    const { connection, request } = fakeConnection({ results: [], unavailable: [] })
    await createPortalSubtitleService(connection).search({ language: 'pt-BR', tmdbId: 603 }, signal)
    expect(request).toHaveBeenCalledWith('/portal/v1/device/subtitles/search', {
      bearer: 'tv-bearer', body: { language: 'pt-BR', tmdbId: 603 }, signal,
    })
    await createPortalSubtitleService(connection, { providers: ['subdl'] }).search({ language: 'en', tmdbId: 1 }, signal)
    expect((request.mock.calls[1] as unknown[])[1]).toMatchObject({ body: { language: 'en', tmdbId: 1, providers: ['subdl'] } })
  })

  it('aproveita os itens válidos, descarta os de forma estranha e repassa quem não respondeu', async () => {
    const { connection } = fakeConnection({
      results: [
        GOOD,
        { ...GOOD, id: 'https://dl.subdl.com/x.zip?api_key=abc' },
        { ...GOOD, id: 'sd:1-2' },
        { id: 'sd:1-2', provider: 'subdl', language: 'en', release: 'x'.repeat(500), hearingImpaired: true, seasonPack: true },
        { ...GOOD, language: 'fr' },
      ],
      unavailable: ['subdl', 'outro'],
    })
    const response = await createPortalSubtitleService(connection).search({ language: 'pt-BR', tmdbId: 603 }, signal)
    expect(response.results.map((row) => row.id)).toEqual(['os:9001', 'sd:1-2'])
    expect(response.results[1]).toMatchObject({ release: 'x'.repeat(200), seasonPack: true })
    expect(response.results[1].downloads).toBeUndefined()
    expect(response.unavailable).toEqual(['subdl'])
  })

  it('resposta sem forma vira "unavailable"; download sem texto também', async () => {
    await expect(createPortalSubtitleService(fakeConnection({ nada: 1 }).connection).search({ language: 'en', tmdbId: 1 }, signal))
      .rejects.toMatchObject({ code: 'unavailable' })
    await expect(createPortalSubtitleService(fakeConnection({}).connection).download('os:1', 'en', signal))
      .rejects.toMatchObject({ code: 'unavailable' })
    await expect(createPortalSubtitleService(fakeConnection({ text: 'x' }).connection).download('https://x', 'en', signal))
      .rejects.toMatchObject({ code: 'unavailable' })
  })

  it('download manda só o id opaco e o idioma', async () => {
    const { connection, request } = fakeConnection({ text: 'SRT' })
    expect(await createPortalSubtitleService(connection).download('sd:3197651-3213944', 'pt-BR', signal)).toBe('SRT')
    expect(request).toHaveBeenCalledWith('/portal/v1/device/subtitles/download', {
      bearer: 'tv-bearer', body: { id: 'sd:3197651-3213944', language: 'pt-BR' }, signal,
    })
  })

  it.each([
    ['network_error', 0, 'offline', undefined],
    ['subtitles_not_entitled', 0, 'not_entitled', undefined],
    ['subtitles_device_limit', 60_000, 'device_limit', 1_060_000],
    ['rate_limited', 30_000, 'device_limit', 1_030_000],
    ['subtitles_provider_limit', 0, 'provider_limit', undefined],
    ['subtitles_unreadable', 0, 'unreadable', undefined],
    ['service_unavailable', 0, 'unavailable', undefined],
  ])('erro %s vira %s', async (portalCode, retryAfterMs, code, retryAtMs) => {
    const { connection } = fakeConnection(() => {
      throw new PortalRequestError(portalCode, retryAfterMs)
    })
    const error = await createPortalSubtitleService(connection, { now: () => 1_000_000 })
      .search({ language: 'en', tmdbId: 1 }, signal)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SubtitleError)
    expect(error).toMatchObject({ code, retryAtMs })
  })
})

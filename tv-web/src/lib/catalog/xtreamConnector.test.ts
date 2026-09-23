import { acquireXtreamVod, acquireXtreamSeries, fetchSeriesInfo } from './xtreamConnector';
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acquireXtreamChannels,
  buildLiveUrl,
  legacyM3uUrl,
  mapLiveEntry,
  normalizeServerAddress,
  preferredFormat,
  ProviderIncompatibleError,
  resolveAccountStatus,
  type LiveCategory,
} from './xtreamConnector'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('normalizeServerAddress', () => {
  it('prefixa esquema quando o usuário cola só host e porta', () => {
    expect(normalizeServerAddress('exemplo.test:8080')).toBe('http://exemplo.test:8080')
  })

  it('reduz as formas legadas à base, sem duplicar caminho', () => {
    expect(normalizeServerAddress('http://exemplo.test/get.php')).toBe('http://exemplo.test')
    expect(normalizeServerAddress('http://exemplo.test/player_api.php')).toBe('http://exemplo.test')
    expect(normalizeServerAddress('http://exemplo.test/panel_api.php')).toBe('http://exemplo.test')
  })

  it('preserva subpath quando o painel não está na raiz', () => {
    expect(normalizeServerAddress('http://exemplo.test/iptv/player_api.php')).toBe(
      'http://exemplo.test/iptv',
    )
  })

  it('preserva o esquema informado, sem forçar HTTPS', () => {
    expect(normalizeServerAddress('https://exemplo.test/')).toBe('https://exemplo.test')
  })

  it('recusa credencial embutida no endereço (FR-003)', () => {
    expect(() => normalizeServerAddress('http://user:senha@exemplo.test')).toThrow(
      ProviderIncompatibleError,
    )
  })

  it('recusa endereço vazio', () => {
    expect(() => normalizeServerAddress('   ')).toThrow(ProviderIncompatibleError)
  })
})

describe('preferredFormat', () => {
  it('prefere TS quando a conta permite mais de um', () => {
    expect(preferredFormat(['m3u8', 'ts', 'rtmp'])).toBe('ts')
  })

  it('usa o primeiro permitido quando não há TS', () => {
    expect(preferredFormat(['m3u8', 'rtmp'])).toBe('m3u8')
  })

  it('não inventa formato quando a conta não declara nenhum', () => {
    expect(preferredFormat(undefined)).toBeUndefined()
    expect(preferredFormat([])).toBeUndefined()
  })
})

describe('resolveAccountStatus', () => {
  it('usa a primeira forma que responde no formato esperado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const status = await resolveAccountStatus('http://exemplo.test', 'u', 'p')

    expect(status.authorized).toBe(true)
    expect(status.expired).toBe(false)
    expect(status.allowedFormats).toEqual(['ts'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tenta a próxima forma quando a primeira não responde no formato esperado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sem_user_info: true }))
      .mockResolvedValueOnce(jsonResponse({ user_info: { auth: 1 } }))
    vi.stubGlobal('fetch', fetchMock)

    const status = await resolveAccountStatus('http://exemplo.test', 'u', 'p')

    expect(status.authorized).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('credencial recusada interrompe na hora, sem tentar as outras formas', async () => {
    // O endpoint existe e negou — insistir só repetiria a recusa e
    // exporia a senha num caminho a mais.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ erro: 'nao autorizado' }, 401))
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveAccountStatus('http://exemplo.test', 'u', 'p')).rejects.toMatchObject({
      kind: 'invalid_credentials',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reconhece conta autorizada mas expirada, distinta de credencial inválida', async () => {
    const past = Math.floor(Date.now() / 1000) - 60
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ user_info: { auth: 1, exp_date: String(past) } })),
    )

    const status = await resolveAccountStatus('http://exemplo.test', 'u', 'p')

    expect(status.authorized).toBe(true)
    expect(status.expired).toBe(true)
  })

  it('exp_date ausente ou zero não é tratado como expirado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ user_info: { auth: 1, exp_date: null } })),
    )

    const status = await resolveAccountStatus('http://exemplo.test', 'u', 'p')
    expect(status.expired).toBe(false)
  })

  it('indicador de autorização desconhecido nunca vira acesso por omissão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ user_info: { auth: 'talvez' } })),
    )

    const status = await resolveAccountStatus('http://exemplo.test', 'u', 'p')
    expect(status.authorized).toBe(false)
  })

  it('distingue recusa de conexão direta (CORS) de falha de rede (US5/FR-011)', async () => {
    // fetch normal falha nas três tentativas; a sondagem em no-cors
    // resolve — logo a rede chegou e quem barrou foi a origem cruzada.
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      // O que importa da resposta opaca é que ela **resolve**; o corpo é
      // ilegível de qualquer jeito. (Não dá para construí-la com
      // `status: 0` — o construtor de Response só aceita 200–599.)
      if (init?.mode === 'no-cors') return Promise.resolve(new Response(null, { status: 200 }))
      return Promise.reject(new TypeError('Failed to fetch'))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveAccountStatus('http://exemplo.test', 'u', 'p')).rejects.toMatchObject({
      kind: 'direct_connection_refused',
    })
  })

  it('quando nem a sondagem resolve, reporta falha de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(resolveAccountStatus('http://exemplo.test', 'u', 'p')).rejects.toMatchObject({
      kind: 'network_failure',
    })
  })

  it('painel que responde status inesperado em todas as formas é incompatível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)))

    await expect(resolveAccountStatus('http://exemplo.test', 'u', 'p')).rejects.toBeInstanceOf(
      ProviderIncompatibleError,
    )
  })
})

describe('mapLiveEntry', () => {
  const categories = new Map<string, LiveCategory>([
    ['10', { id: '10', name: 'Esportes', order: 0 }],
    ['20', { id: '20', name: '', order: 1 }],
  ])
  const buildUrl = (streamId: string) => `http://exemplo.test/live/u/p/${streamId}.ts`

  it('preserva identificador e categoria declarados pelo provedor', () => {
    const mapped = mapLiveEntry({ name: 'ESPN', stream_id: 5, category_id: 10 }, categories, buildUrl)

    expect(mapped?.providerStreamId).toBe('5')
    expect(mapped?.providerCategoryId).toBe('10')
    expect(mapped?.group).toBe('Esportes')
    expect(mapped?.groupOrder).toBe(0)
    expect(mapped?.kind).toBe('channel')
  })

  it('preserva categoria de nome vazio como a fonte declarou', () => {
    const mapped = mapLiveEntry({ name: 'Canal', stream_id: 7, category_id: 20 }, categories, buildUrl)
    expect(mapped?.group).toBe('')
  })

  it('canal com categoria desconhecida continua acessível, sem vínculo forjado', () => {
    const mapped = mapLiveEntry({ name: 'Canal', stream_id: 8, category_id: 99 }, categories, buildUrl)

    expect(mapped).toBeDefined()
    expect(mapped?.group).toBeUndefined()
    expect(mapped?.providerCategoryId).toBe('99')
  })

  it('descarta entrada sem nome utilizável em vez de inventar um', () => {
    expect(mapLiveEntry({ stream_id: 9 }, categories, buildUrl)).toBeUndefined()
    expect(mapLiveEntry({ name: '   ', stream_id: 9 }, categories, buildUrl)).toBeUndefined()
  })

  it('canal sem identificador fica sem URL, em vez de URL inventada', () => {
    const mapped = mapLiveEntry({ name: 'Sem id' }, categories, buildUrl)

    expect(mapped).toBeDefined()
    expect(mapped?.url).toBeUndefined()
  })
})

describe('acquireXtreamChannels', () => {
  it('preserva a ordem das categorias declarada pelo painel (SC-010)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('get_live_categories')) {
        return Promise.resolve(
          jsonResponse([
            { category_id: '2', category_name: 'Zulu' },
            { category_id: '1', category_name: 'Alfa' },
          ]),
        )
      }
      return Promise.resolve(
        jsonResponse([
          { name: 'Canal Alfa', stream_id: 11, category_id: '1' },
          { name: 'Canal Zulu', stream_id: 22, category_id: '2' },
        ]),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await acquireXtreamChannels('http://exemplo.test', 'u', 'p', {
      authorized: true,
      expired: false,
      allowedFormats: ['ts'],
    })

    // "Zulu" veio primeiro do painel, então tem ordem 0 — ordem da fonte,
    // não ordem alfabética.
    const zulu = result.channels.find((channel) => channel.name === 'Canal Zulu')
    const alfa = result.channels.find((channel) => channel.name === 'Canal Alfa')
    expect(zulu?.groupOrder).toBe(0)
    expect(alfa?.groupOrder).toBe(1)
  })

  it('sem formato permitido, os canais ficam sem URL em vez de URL assumida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('get_live_categories')
            ? jsonResponse([])
            : jsonResponse([{ name: 'Canal', stream_id: 1 }]),
        ),
      ),
    )

    const result = await acquireXtreamChannels('http://exemplo.test', 'u', 'p', {
      authorized: true,
      expired: false,
      allowedFormats: undefined,
    })

    expect(result.channels).toHaveLength(1)
    expect(result.channels[0].url).toBeUndefined()
  })
})

describe('montagem de URL', () => {
  it('escapa usuário e senha na URL de reprodução', () => {
    const url = buildLiveUrl('http://exemplo.test', 'u ser', 'p@ss', '42', 'ts')
    expect(url).toBe('http://exemplo.test/live/u%20ser/p%40ss/42.ts')
  })

  it('monta a URL do caminho legado com os parâmetros esperados', () => {
    const url = legacyM3uUrl('http://exemplo.test', 'u', 'p')
    expect(url).toContain('/get.php?')
    expect(url).toContain('type=m3u_plus')
  })
})

  describe('VOD and Series Extension', () => {
    it('acquireXtreamVod should map VOD entries correctly', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (req) => {
        const url = new URL(typeof req === 'string' ? req : req.url)
        if (url.searchParams.get('action') === 'get_vod_categories') {
          return jsonResponse([{ category_id: '10', category_name: 'Action Movies' }])
        }
        if (url.searchParams.get('action') === 'get_vod_streams') {
          return jsonResponse([
            { stream_id: 100, name: ' Die Hard ', category_id: '10', container_extension: 'mkv' }
          ])
        }
        return new Response(null, { status: 404 })
       }))

            const vods = await acquireXtreamVod('http://mock', 'user', 'pass')

      expect(vods).toHaveLength(1)
      expect(vods[0]).toEqual({
        kind: 'movie',
        name: 'Die Hard',
        originalName: 'Die Hard',
        group: 'Action Movies',
        groupOrder: 0,
        url: 'http://mock/movie/user/pass/100.mkv',
        providerStreamId: '100',
        providerCategoryId: '10',
        streamExtension: 'mkv',
      })
    })

    it('acquireXtreamSeries should map Series entries correctly', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (req) => {
        const url = new URL(typeof req === 'string' ? req : req.url)
        if (url.searchParams.get('action') === 'get_series_categories') {
          return jsonResponse([{ category_id: '20', category_name: 'Comedy Series' }])
        }
        if (url.searchParams.get('action') === 'get_series') {
          return jsonResponse([
            { series_id: 200, name: ' The Office ', category_id: '20' }
          ])
        }
        return new Response(null, { status: 404 })
       }))

      const series = await acquireXtreamSeries('http://mock', 'user', 'pass')

      expect(series).toHaveLength(1)
      expect(series[0]).toEqual({
        kind: 'series',
        name: 'The Office',
        originalName: 'The Office',
        group: 'Comedy Series',
        groupOrder: 0,
        providerCategoryId: '20',
        seriesId: '200',
      })
    })

    it('fetchSeriesInfo should map episodes properly', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (req) => {
        const url = new URL(typeof req === 'string' ? req : req.url)
        if (url.searchParams.get('action') === 'get_series_info' && url.searchParams.get('series_id') === '200') {
          return jsonResponse({
            episodes: {
              "1": [
                { id: "1001", episode_num: 1, title: "Pilot", container_extension: "mp4" }
              ],
              "2": [
                { id: "1002", episode_num: 1, title: "The Dundies", container_extension: "mkv" }
              ]
            }
          })
        }
        return new Response(null, { status: 404 })
       }))

      const episodes = await fetchSeriesInfo('http://mock', 'user', 'pass', '200')
      expect(episodes).toHaveLength(2)

      expect(episodes[0]).toMatchObject({
        kind: 'episode',
        name: 'Pilot',
        url: 'http://mock/series/user/pass/1001.mp4',
        seriesId: '200',
        seasonNumber: 1,
        episodeNumber: 1
      })

      expect(episodes[1]).toMatchObject({
        kind: 'episode',
        name: 'The Dundies',
        url: 'http://mock/series/user/pass/1002.mkv',
        seriesId: '200',
        seasonNumber: 2,
        episodeNumber: 1
      })
    })
  })

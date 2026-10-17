// Diretório Radio Browser fictício para os E2E da feature 074. Intercepta todo `*.api.radio-browser.info` com
// `page.route` — os roteiros nunca falam com o serviço real — e registra cada requisição para as asserções de
// privacidade (FR-026) e de "focar não consulta" (FR-007).

/** Estação no formato cru do diretório. `streamBase` deve apontar para um servidor local (o stream pode falhar). */
export function radioDirectoryStation(uuid, name, countrycode, streamBase) {
  return { stationuuid: uuid, name, url_resolved: `${streamBase}/${uuid}.mp3`, countrycode, tags: 'pop,news', codec: 'MP3', bitrate: 128, hls: 0, clickcount: 10 }
}

export const RADIO_MOCK_COUNTRIES = [
  { name: 'Brazil', iso_3166_1: 'BR', stationcount: 500 },
  { name: 'Argentina', iso_3166_1: 'AR', stationcount: 300 },
  { name: 'Portugal', iso_3166_1: 'PT', stationcount: 50 },
]

/**
 * @param {import('playwright').Page} page
 * @param {Record<string, object[]>} byCountry  estações cruas por código de país
 * @returns {Promise<{ method: string, path: string, query: string }[]>} requisições vistas (preenchidas ao vivo)
 */
export async function mockRadioDirectory(page, byCountry) {
  const requests = []
  await page.route(/^https:\/\/[a-z0-9.-]*api\.radio-browser\.info\//, async (route) => {
    const url = new URL(route.request().url())
    requests.push({ method: route.request().method(), path: url.pathname, query: url.search })
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) })
    if (url.pathname === '/json/servers') return json([{ name: 'mock.api.radio-browser.info' }])
    if (url.pathname === '/json/stats') return json({ status: 'OK' })
    if (url.pathname === '/json/countries') return json(RADIO_MOCK_COUNTRIES)
    if (url.pathname === '/json/stations/search') return json(byCountry[url.searchParams.get('countrycode') ?? ''] ?? [])
    if (url.pathname === '/json/stations/byuuid') {
      const wanted = (url.searchParams.get('uuids') ?? '').split(',')
      return json(Object.values(byCountry).flat().filter((item) => wanted.includes(item.stationuuid)))
    }
    if (url.pathname.startsWith('/json/url/')) return json({ ok: true })
    return route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  return requests
}

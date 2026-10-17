/**
 * Contrato da feature 074 (Rádio global) para o conector do diretório — travado pelo sdd-plan.
 * Só pela interface pública (`createRadioDirectory` + `fetchImpl` injetado).
 */
import { describe, expect, it } from 'vitest'
import { createRadioDirectory, RadioDirectoryError } from './radioDirectory'

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const VALID = {
  stationuuid: 'uuid-1',
  name: ' Rádio Um ',
  url_resolved: 'https://stream.example/um',
  favicon: 'https://img.example/um.png',
  countrycode: 'br',
  tags: 'pop,rock,news',
  codec: 'MP3',
  bitrate: 128,
  hls: 0,
  clickcount: 42,
}

describe('radioDirectory — contrato da feature 074', () => {
  // FR-025, FR-026, FR-027, SC-006; ADR-018 §2/§3 (espelho descoberto, só país + parâmetros fixos, falha por categoria).
  it('consulta só o espelho descoberto com os parâmetros fixos, descarta estação inválida e trata resposta não-JSON como falha', async () => {
    const requested: string[] = []
    let countriesBody: 'html' | 'ok' = 'ok'
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      requested.push(url)
      if (url === 'https://all.api.radio-browser.info/json/servers') return json([{ name: 'm1.api.radio-browser.info' }])
      if (url === 'https://m1.api.radio-browser.info/json/stats') return json({ status: 'OK' })
      if (url.startsWith('https://m1.api.radio-browser.info/json/stations/search')) {
        return json([VALID, { ...VALID, stationuuid: 'uuid-2', url_resolved: '' }, { ...VALID }])
      }
      if (url.startsWith('https://m1.api.radio-browser.info/json/countries') && countriesBody === 'html') {
        return new Response('<html><body>captcha</body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
      }
      return new Response('', { status: 404 })
    }) as typeof fetch

    const directory = createRadioDirectory({ fetchImpl, random: () => 0 })
    const stations = await directory.listStations({ countryCode: 'BR' })

    // Só a estação válida, uma vez (sem duplicar o mesmo uuid), já normalizada.
    expect(stations).toHaveLength(1)
    expect(stations[0]).toMatchObject({
      id: 'radio-browser:uuid-1',
      uuid: 'uuid-1',
      name: 'Rádio Um',
      streamUrl: 'https://stream.example/um',
      countryCode: 'BR',
    })

    // Nenhum host além do índice de espelhos e do espelho escolhido; na busca, só o país e os parâmetros fixos.
    for (const url of requested) {
      expect(['all.api.radio-browser.info', 'm1.api.radio-browser.info']).toContain(new URL(url).host)
    }
    const search = new URL(requested.find((url) => url.includes('/json/stations/search')) ?? 'https://x/')
    expect(Object.fromEntries(search.searchParams)).toEqual({
      countrycode: 'BR',
      hidebroken: 'true',
      order: 'clickcount',
      reverse: 'true',
      limit: '100',
    })

    countriesBody = 'html'
    const failure = await directory.listCountries().then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(RadioDirectoryError)
    expect((failure as RadioDirectoryError).kind).toBe('bad_response')
    expect((failure as Error).message).not.toMatch(/https?:|radio-browser/)
  })
})

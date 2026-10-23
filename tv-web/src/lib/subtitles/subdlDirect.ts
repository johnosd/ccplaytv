/**
 * SubDL com a chave pessoal (feature 090, BYOK): mesma tradução e normalização de `api/app/portal/providers/subdl.py`
 * (D-015). A chave vai na consulta; a URL de download do fornecedor (que também a carrega) nunca é guardada: fica só o
 * par `<a>-<b>`.
 */
import { DirectProviderError, MAX_RESULTS, call, isInt, readJson, readLimited, wantsEpisode, type DirectProvider, type FetchLike } from './directHttp'
import type { SubtitleLanguage, SubtitleResult, SubtitleSearchRequest } from './types'
import { decodeSubtitleText, extractSubtitleFromZip, MAX_ZIP_BYTES } from './zipReader'

export const SD_API = 'https://api.subdl.com/api/v1/subtitles'
export const SD_DOWNLOAD = 'https://dl.subdl.com/subtitle/'
export const SD_LANGUAGE: Record<SubtitleLanguage, string> = { 'pt-BR': 'BR_PT', en: 'EN', es: 'ES' }
export const SD_URL_PAIR = /^\/subtitle\/(\d{1,12}-\d{1,12})\.zip(?:\?|$)/
export const SD_PAIR = /^\d{1,12}-\d{1,12}$/

export function subdlParams(request: SubtitleSearchRequest): Record<string, string> {
  const params: Record<string, string> = { subs_per_page: '30', languages: SD_LANGUAGE[request.language] }
  if ('tmdbId' in request) {
    params.tmdb_id = String(request.tmdbId)
    params.type = 'movie'
  } else if ('parentTmdbId' in request) {
    params.tmdb_id = String(request.parentTmdbId)
    params.type = 'tv'
    params.season_number = String(request.season)
    params.episode_number = String(request.episode)
  } else {
    params.film_name = request.query
    if (request.year !== undefined) params.year = String(request.year)
    if (request.season !== undefined) {
      params.type = 'tv'
      params.season_number = String(request.season)
    }
    if (request.episode !== undefined) params.episode_number = String(request.episode)
  }
  return params
}

export function normalizeSubdl(payload: Record<string, unknown>, request: SubtitleSearchRequest): SubtitleResult[] {
  const wanted = SD_LANGUAGE[request.language]
  const wantedSeason = 'season' in request ? request.season : undefined
  const wantedEpisode = 'episode' in request ? request.episode : undefined
  const episodeSearch = wantsEpisode(request)
  const exact: SubtitleResult[] = []
  const packs: SubtitleResult[] = []
  const rows = Array.isArray(payload.subtitles) ? payload.subtitles : []
  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue
    const row = raw as Record<string, unknown>
    if (String(row.language ?? '').toUpperCase() !== wanted) continue
    const pair = SD_URL_PAIR.exec(String(row.url ?? ''))?.[1]
    if (!pair) continue
    const hit: SubtitleResult = {
      id: `sd:${pair}`,
      provider: 'subdl',
      language: request.language,
      release: String(row.release_name || row.name || '').slice(0, 200),
      hearingImpaired: row.hi === true,
    }
    if (!episodeSearch) {
      exact.push(hit)
      continue
    }
    const season = isInt(row.season) ? row.season : null
    const episode = isInt(row.episode) ? row.episode : null
    if (season !== null && season !== 0 && wantedSeason !== undefined && season !== wantedSeason) continue
    if (episode !== null && episode === wantedEpisode) {
      exact.push(hit)
      continue
    }
    const start = isInt(row.episode_from) ? row.episode_from : null
    const end = isInt(row.episode_end) ? row.episode_end : null
    const inRange = start !== null && end !== null && start <= (wantedEpisode ?? 0) && (wantedEpisode ?? 0) <= end
    if (row.full_season === true || episode === null || inRange) packs.push({ ...hit, seasonPack: true })
  }
  return [...exact, ...packs].slice(0, MAX_RESULTS)
}

/** `status: false` do SubDL: cota → limite; chave recusada → rejeitada; "não achei" → nenhum resultado. */
export function subdlLimitFailure(payload: Record<string, unknown>): DirectProviderError | null {
  if (payload.status !== false) return null
  const message = String(payload.error ?? '').toLowerCase()
  if (message.includes('quota') || message.includes('limit')) return new DirectProviderError('limit')
  if (message.includes('api') && message.includes('key')) return new DirectProviderError('rejected')
  return null
}

export function createSubdl(key: string, fetchImpl: FetchLike): DirectProvider {
  return {
    async search(request, signal) {
      const query = new URLSearchParams({ ...subdlParams(request), api_key: key }).toString()
      const response = await call(fetchImpl, `${SD_API}?${query}`, { signal })
      if (response.status === 429) throw new DirectProviderError('limit')
      if (response.status === 401 || response.status === 403) throw new DirectProviderError('rejected')
      if (response.status < 200 || response.status >= 500) throw new DirectProviderError('unavailable')
      const payload = await readJson(response)
      const failure = subdlLimitFailure(payload)
      if (failure) throw failure
      if (payload.status === false || response.status >= 300) return []
      return normalizeSubdl(payload, request)
    },
    async download(resultId, signal, context) {
      const pair = resultId.slice(3)
      if (!SD_PAIR.test(pair)) throw new DirectProviderError('unavailable')
      const response = await call(fetchImpl, `${SD_DOWNLOAD}${pair}.zip?${new URLSearchParams({ api_key: key })}`, { signal })
      if (response.status === 429) throw new DirectProviderError('limit')
      if (response.status === 401 || response.status === 403) throw new DirectProviderError('rejected')
      if (!(response.status >= 200 && response.status < 300)) throw new DirectProviderError('unavailable')
      const zip = await readLimited(response, MAX_ZIP_BYTES)
      try {
        return decodeSubtitleText(await extractSubtitleFromZip(zip, context))
      } catch {
        throw new DirectProviderError('unreadable')
      }
    },
  }
}


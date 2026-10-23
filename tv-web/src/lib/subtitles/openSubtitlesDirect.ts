/**
 * OpenSubtitles com a chave pessoal (feature 090, BYOK): mesma tradução e normalização de
 * `api/app/portal/providers/opensubtitles.py` (D-015). A chave só vai no cabeçalho `Api-Key`; o navegador não deixa definir `User-Agent`, então o
 * `X-User-Agent` (aceito pelo fornecedor) o substitui — provado na TV física (`evidencias/cors-direto-tv-2026-10-23.md`).
 */
import { DirectProviderError, MAX_RESULTS, call, decodeText, isInt, readJson, readLimited, statusFailure, type DirectProvider, type FetchLike } from './directHttp'
import type { SubtitleLanguage, SubtitleResult, SubtitleSearchRequest } from './types'
import { MAX_TEXT_BYTES } from './zipReader'

export const USER_AGENT = 'ccplayTv v1'
export const OS_API = 'https://api.opensubtitles.com/api/v1'
export const OS_LINK_SUFFIXES = ['.opensubtitles.com', '.opensubtitles.org']
export const OS_LANGUAGE: Record<SubtitleLanguage, string> = { 'pt-BR': 'pt-br', en: 'en', es: 'es' }

export function openSubtitlesParams(request: SubtitleSearchRequest): Record<string, string> {
  const params: Record<string, string> = { languages: OS_LANGUAGE[request.language] }
  if ('tmdbId' in request) params.tmdb_id = String(request.tmdbId)
  else if ('parentTmdbId' in request) {
    params.parent_tmdb_id = String(request.parentTmdbId)
    params.season_number = String(request.season)
    params.episode_number = String(request.episode)
  } else {
    params.query = request.query
    if (request.year !== undefined) params.year = String(request.year)
    if (request.season !== undefined) params.season_number = String(request.season)
    if (request.episode !== undefined) params.episode_number = String(request.episode)
  }
  // Boa prática do fornecedor: parâmetros em ordem alfabética.
  return Object.fromEntries(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1)))
}

export function normalizeOpenSubtitles(payload: Record<string, unknown>, language: SubtitleLanguage): SubtitleResult[] {
  const hits: SubtitleResult[] = []
  const rows = Array.isArray(payload.data) ? payload.data : []
  for (const row of rows) {
    const attributes = (row as { attributes?: unknown } | null)?.attributes as Record<string, unknown> | undefined
    if (!attributes || typeof attributes !== 'object') continue
    if (String(attributes.language ?? '').toLowerCase() !== OS_LANGUAGE[language]) continue
    const files = Array.isArray(attributes.files) ? (attributes.files as Record<string, unknown>[]) : []
    const fileId = files[0]?.file_id
    if (!isInt(fileId) || fileId <= 0 || fileId >= 10 ** 12) continue
    const release = attributes.release || files[0]?.file_name || ''
    const downloads = attributes.download_count
    hits.push({
      id: `os:${fileId}`,
      provider: 'opensubtitles',
      language,
      release: String(release).slice(0, 200),
      hearingImpaired: attributes.hearing_impaired === true,
      downloads: isInt(downloads) && downloads >= 0 ? downloads : 0,
    })
  }
  hits.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
  return hits.slice(0, MAX_RESULTS)
}

export function createOpenSubtitles(key: string, fetchImpl: FetchLike): DirectProvider {
  const headers = (extra: Record<string, string> = {}) => ({ 'Api-Key': key, Accept: 'application/json', 'X-User-Agent': USER_AGENT, ...extra })
  const check = (status: number, payload?: Record<string, unknown>) => {
    if (status >= 200 && status < 300) return
    if (status === 406 || status === 407 || status === 429 || payload?.remaining === 0) throw new DirectProviderError('limit')
    throw statusFailure(status)
  }
  return {
    async search(request, signal) {
      const query = new URLSearchParams(openSubtitlesParams(request)).toString()
      const response = await call(fetchImpl, `${OS_API}/subtitles?${query}`, { headers: headers(), signal })
      check(response.status)
      return normalizeOpenSubtitles(await readJson(response), request.language)
    },
    async download(resultId, signal) {
      const fileId = Number(resultId.slice(3))
      const asked = await call(fetchImpl, `${OS_API}/download`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ file_id: fileId }),
        signal,
      })
      const payload = asked.status >= 200 && asked.status < 300 ? await readJson(asked) : {}
      check(asked.status, payload)
      const link = payload.link
      if (typeof link !== 'string') throw new DirectProviderError('unavailable')
      // O link é temporário e do fornecedor: só https em host dele; nunca guardado nem logado.
      let url: URL
      try {
        url = new URL(link)
      } catch {
        throw new DirectProviderError('unavailable')
      }
      if (url.protocol !== 'https:' || !OS_LINK_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))) {
        throw new DirectProviderError('unavailable')
      }
      const file = await call(fetchImpl, url.toString(), { signal })
      if (!(file.status >= 200 && file.status < 300)) throw new DirectProviderError('unavailable')
      return decodeText(await readLimited(file, MAX_TEXT_BYTES))
    },
  }
}


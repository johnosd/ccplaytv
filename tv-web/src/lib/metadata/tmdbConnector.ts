import type { TmdbKeyFormat } from './types'
import { isRequestAbortError, requestDeadline, type RequestDeadlineOptions } from './requestDeadline'

/**
 * Único ponto de rede do TMDB (feature 032, `logic/chave-tmdb.md` §6).
 *
 * **A chave só passa por aqui**, e só para `api.themoviedb.org`: v3 na query
 * (`api_key`), v4 no cabeçalho `Authorization: Bearer`. A URL v3 carrega a
 * chave — por isso nada aqui guarda `message`/`url` de um erro de `fetch`, e
 * nenhum `console.*` é permitido. Imagens (`image.tmdb.org`) são montadas SEM
 * chave.
 */

const API_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'

export type TmdbImageSize = 'w185' | 'w342' | 'w780' | 'w1280'

export type TmdbFailure = 'refused' | 'rate_limited' | 'offline' | 'not_found'

export class TmdbError extends Error {
  readonly kind: TmdbFailure
  readonly retryAfterMs?: number

  constructor(kind: TmdbFailure, retryAfterMs?: number) {
    // Mensagem fixa por categoria: nunca a do `fetch` (carrega a URL com a chave).
    super(`tmdb:${kind}`)
    this.name = 'TmdbError'
    this.kind = kind
    this.retryAfterMs = retryAfterMs
  }
}

export interface TmdbCredential {
  key: string
  format: TmdbKeyFormat
}

const V3_PATTERN = /^[0-9a-f]{32}$/i
const V4_PATTERN = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/

/** v3 = 32 hex; v4 = JWT. Qualquer outra coisa → `undefined` (sem requisição). */
export function detectKeyFormat(raw: string): TmdbKeyFormat | undefined {
  const key = raw.trim()
  if (V3_PATTERN.test(key)) return 'v3'
  if (V4_PATTERN.test(key)) return 'v4'
  return undefined
}

/** `https://image.tmdb.org/t/p/<tamanho>/<caminho>` — sem chave. */
export function tmdbImageUrl(path: string, size: TmdbImageSize = 'w1280'): string {
  return `${IMAGE_BASE}/${size}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * GET em `path` (ex.: `/movie/603`) com a credencial. Sucesso → JSON;
 * qualquer falha → `TmdbError` com categoria fixa.
 */
export async function tmdbGet(
  path: string,
  params: Record<string, string>,
  credential: TmdbCredential,
  fetchImpl: typeof fetch = fetch,
  requestOptions: RequestDeadlineOptions = {},
): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  const init: RequestInit = {}
  if (credential.format === 'v3') url.searchParams.set('api_key', credential.key)
  else init.headers = { Authorization: `Bearer ${credential.key}` }

  try {
    return await requestDeadline(async signal => {
      const response = await fetchImpl(url.toString(), { ...init, signal })
      if (response.status === 401) throw new TmdbError('refused')
      if (response.status === 404) throw new TmdbError('not_found')
      if (response.status === 429) throw new TmdbError('rate_limited', retryAfterMs(response.headers, requestOptions.now?.() ?? Date.now()))
      if (!response.ok) throw new TmdbError('offline')
      return await response.json()
    }, requestOptions)
  } catch (error) {
    if (isRequestAbortError(error)) throw error
    if (error instanceof TmdbError) throw error
    throw new TmdbError('offline')
  }
}

function retryAfterMs(headers: Headers | undefined, now: number): number | undefined {
  const value = headers?.get('Retry-After')?.trim()
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) && date > now ? date - now : undefined
}

/** `GET /authentication` — valida a chave sem consumir cota relevante. */
export async function tmdbAuthenticate(credential: TmdbCredential, fetchImpl: typeof fetch = fetch, requestOptions: RequestDeadlineOptions = {}): Promise<void> {
  const body = (await tmdbGet('/authentication', {}, credential, fetchImpl, requestOptions)) as { success?: unknown } | null
  if (body?.success !== true) throw new TmdbError('refused')
}

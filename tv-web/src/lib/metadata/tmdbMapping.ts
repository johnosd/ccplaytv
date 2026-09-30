import type { TitleFields } from '../catalog/db'
import { trailerRefsFromTmdbVideos } from '../trailer/trailerCandidates'
import { tmdbImageUrl } from './tmdbConnector'

/**
 * Detalhe do TMDB → campos do app (feature 032, `data-model.md` §3). Só o que
 * existe: vazio nunca vira valor. Sem `console.*`, sem repassar payload cru.
 */

export type TmdbKind = 'movie' | 'tv'

interface Named {
  name?: unknown
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function names(list: unknown, limit = Number.POSITIVE_INFINITY): string[] {
  if (!Array.isArray(list)) return []
  return (list as Named[])
    .map((item) => (typeof item?.name === 'string' ? item.name.trim() : ''))
    .filter((name) => name !== '')
    .slice(0, limit)
}

function joined(values: string[]): string | undefined {
  return values.length > 0 ? values.join(', ') : undefined
}

/** Código ISO 3166 → nome do país em português; o próprio código se o ambiente não souber. */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

function positiveMinutes(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 60) : undefined
}

function countries(detail: Record<string, unknown>): string | undefined {
  const production = Array.isArray(detail.production_countries)
    ? (detail.production_countries as Record<string, unknown>[])
        .map((country) => (typeof country?.iso_3166_1 === 'string' ? countryName(country.iso_3166_1) : ''))
        .filter((name) => name !== '')
    : []
  if (production.length > 0) return joined(production)
  const origin = Array.isArray(detail.origin_country)
    ? (detail.origin_country as unknown[]).filter((code): code is string => typeof code === 'string').map(countryName)
    : []
  return joined(origin)
}

function directors(credits: Record<string, unknown>): string | undefined {
  if (!Array.isArray(credits.crew)) return undefined
  const found = (credits.crew as Record<string, unknown>[])
    .filter((member) => member?.job === 'Director' && typeof member.name === 'string')
    .map((member) => (member.name as string).trim())
  return joined(found)
}

/** Nome exibido do idioma original, só para saber se o pt-BR já é o original. */
export function originalLanguageOf(detail: unknown): string | undefined {
  const language = record(detail).original_language
  return typeof language === 'string' && language !== '' ? language : undefined
}

export function overviewOf(detail: unknown): string | undefined {
  const overview = record(detail).overview
  return typeof overview === 'string' && overview.trim() !== '' ? overview.trim() : undefined
}

/**
 * `fields` já em pt-BR. A sinopse vem do `overview` do detalhe recebido —
 * o fallback de idioma (FR-021) é decidido por quem chama, que sabe se pediu
 * o idioma original.
 */
export function mapTmdbDetail(kind: TmdbKind, rawDetail: unknown): TitleFields {
  const detail = record(rawDetail)
  const credits = record(detail.credits)
  const backdropPath = typeof detail.backdrop_path === 'string' && detail.backdrop_path !== '' ? detail.backdrop_path : undefined

  const runtimeSeconds =
    kind === 'movie'
      ? positiveMinutes(detail.runtime)
      : positiveMinutes(Array.isArray(detail.episode_run_time) ? detail.episode_run_time[0] : undefined)

  const fields: TitleFields = {
    synopsis: overviewOf(detail),
    backdropUrl: backdropPath ? tmdbImageUrl(backdropPath) : undefined,
    genres: joined(names(detail.genres)),
    durationSeconds: runtimeSeconds,
    // Série: a direção por episódio varia; o TMDB não a tem no nível da série.
    director: kind === 'movie' ? directors(credits) : undefined,
    country: countries(detail),
    cast: joined(names(credits.cast, 10)),
    // Só quando a resposta trouxe `videos` (pode ser `[]`): a ausência da chave é o que marca um registro anterior à 033.
    trailerVideos: 'videos' in detail ? trailerRefsFromTmdbVideos(detail.videos) : undefined,
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as TitleFields
}

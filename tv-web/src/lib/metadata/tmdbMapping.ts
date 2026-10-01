import type { CastPerson, TitleFields, TmdbTitleRef } from '../catalog/db'
import { trailerRefsFromTmdbVideos } from '../trailer/trailerCandidates'
import { tmdbImageUrl } from './tmdbConnector'
import { yearOfDate } from './tmdbMatch'

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
const SIMILAR_MAX = 20
const CAST_PEOPLE_MAX = 20

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Recomendações ++ similares, sem repetir nem citar o próprio título, até 20 (D-004).
 * Sempre presente (`[]` se nada serve): as listas são pedidas na mesma chamada, então
 * a chave ausente na resposta é "nada veio", e o registro não pode ser repetido a cada abertura.
 */
function mapSimilar(kind: TmdbKind, detail: Record<string, unknown>): TmdbTitleRef[] {
  const lists = [record(detail.recommendations).results, record(detail.similar).results]
  const selfId = typeof detail.id === 'number' ? detail.id : undefined
  const seen = new Set<number>()
  const refs: TmdbTitleRef[] = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (refs.length >= SIMILAR_MAX) break
      const item = record(entry)
      const id = item.id
      const title = nonEmptyString(item.title) ?? nonEmptyString(item.name)
      if (typeof id !== 'number' || !Number.isFinite(id) || title === undefined) continue
      if (id === selfId || seen.has(id)) continue
      seen.add(id)
      const ref: TmdbTitleRef = { tmdbId: id, kind: kind === 'movie' ? 'movie' : 'series', title }
      const originalTitle = nonEmptyString(item.original_title) ?? nonEmptyString(item.original_name)
      if (originalTitle !== undefined) ref.originalTitle = originalTitle
      const year = yearOfDate(item.release_date) ?? yearOfDate(item.first_air_date)
      if (year !== undefined) ref.year = year
      const poster = nonEmptyString(item.poster_path)
      if (poster !== undefined) ref.posterUrl = tmdbImageUrl(poster, 'w342')
      const overview = nonEmptyString(item.overview)
      if (overview !== undefined) ref.overview = overview
      refs.push(ref)
    }
  }
  return refs
}

/** Papel de mais episódios de uma pessoa em `aggregate_credits` (série). */
function mainRole(roles: unknown): string | undefined {
  if (!Array.isArray(roles)) return undefined
  let best: { character: string; count: number } | undefined
  for (const role of roles) {
    const item = record(role)
    const character = nonEmptyString(item.character)
    if (character === undefined) continue
    const count = typeof item.episode_count === 'number' ? item.episode_count : 0
    if (best === undefined || count > best.count) best = { character, count }
  }
  return best?.character
}

/** Elenco por `order`, até 20; filme lê `credits.cast`, série `aggregate_credits.cast`. */
function orderedCast(kind: TmdbKind, detail: Record<string, unknown>): Record<string, unknown>[] {
  const source = record(kind === 'movie' ? detail.credits : detail.aggregate_credits)
  if (!Array.isArray(source.cast)) return []
  return (source.cast as unknown[])
    .map((entry, index) => ({ item: record(entry), index }))
    .sort((a, b) => {
      const orderA = typeof a.item.order === 'number' ? a.item.order : Number.POSITIVE_INFINITY
      const orderB = typeof b.item.order === 'number' ? b.item.order : Number.POSITIVE_INFINITY
      return orderA === orderB ? a.index - b.index : orderA - orderB
    })
    .map(({ item }) => item)
}

function mapCastPeople(kind: TmdbKind, detail: Record<string, unknown>): CastPerson[] {
  const seen = new Set<number>()
  const people: CastPerson[] = []
  for (const item of orderedCast(kind, detail)) {
    if (people.length >= CAST_PEOPLE_MAX) break
    const id = item.id
    const name = nonEmptyString(item.name)
    if (typeof id !== 'number' || !Number.isFinite(id) || name === undefined || seen.has(id)) continue
    seen.add(id)
    const person: CastPerson = { personId: id, name }
    const character = kind === 'movie' ? nonEmptyString(item.character) : mainRole(item.roles)
    if (character !== undefined) person.character = character
    const photo = nonEmptyString(item.profile_path)
    if (photo !== undefined) person.photoUrl = tmdbImageUrl(photo, 'w185')
    people.push(person)
  }
  return people
}

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
    cast: joined(orderedCast(kind, detail).slice(0, 10).map((item) => nonEmptyString(item.name) ?? '').filter((name) => name !== '')),
    similar: mapSimilar(kind, detail),
    castPeople: (() => {
      const people = mapCastPeople(kind, detail)
      return people.length > 0 ? people : undefined
    })(),
    // Só quando a resposta trouxe `videos` (pode ser `[]`): a ausência da chave é o que marca um registro anterior à 033.
    trailerVideos: 'videos' in detail ? trailerRefsFromTmdbVideos(detail.videos) : undefined,
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as TitleFields
}

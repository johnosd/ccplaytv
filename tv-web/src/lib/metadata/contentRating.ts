import type { CertificationCountry, Certifications, TmdbRating } from '../catalog/db'
import type { AppLanguage } from '../i18n/languages'
import type { TmdbKind } from './tmdbMapping'

/**
 * Classificação indicativa e nota do TMDB (feature 061, `logic/classificacao-e-nota.md`). Regras puras: nada aqui toca
 * banco, rede ou tela.
 */

export type { CertificationCountry, Certifications, TmdbRating }

/** País da classificação pelo idioma do app (FR-004). Nunca há reserva: sem valor do país, nada aparece (FR-005). */
export const CERTIFICATION_COUNTRY: Record<AppLanguage, CertificationCountry> = { pt: 'BR', en: 'US', es: 'ES' }

/** Mínimo de votos para a nota do TMDB aparecer (FR-008, D-004). */
export const TMDB_MIN_VOTES = 50

const BR = ['L', '10', '12', '14', '16', '18']
const VALID: Record<TmdbKind, Record<CertificationCountry, readonly string[]>> = {
  movie: { BR, US: ['G', 'PG', 'PG-13', 'R', 'NC-17'], ES: ['A', '7', '12', '16', '18'] },
  tv: { BR, US: ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'], ES: ['TP', '7', '12', '13', '16', '18'] },
}
const RELEASE_TYPES = [3, 2, 4, 5, 6, 1]

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function releaseOrder(type: unknown): number {
  const index = RELEASE_TYPES.indexOf(typeof type === 'number' ? type : -1)
  return index < 0 ? RELEASE_TYPES.length : index
}

/**
 * `release_dates` (filme) ou `content_ratings` (série) do detalhe do TMDB → só os valores VÁLIDOS de BR, US e ES
 * (`logic/classificacao-e-nota.md` §1–§2). Sempre devolve um objeto (vazio quando nenhum país serve).
 */
export function certificationsFromTmdb(kind: TmdbKind, detail: unknown): Certifications {
  const results = record(record(detail)[kind === 'movie' ? 'release_dates' : 'content_ratings']).results
  const certifications: Certifications = {}
  if (!Array.isArray(results)) return certifications
  for (const country of ['BR', 'US', 'ES'] as const) {
    const entries = results.map(record).filter((item) => item.iso_3166_1 === country)
    const candidates = kind === 'movie'
      ? entries.flatMap((item) => Array.isArray(item.release_dates) ? item.release_dates.map(record) : [])
        .sort((a, b) => releaseOrder(a.type) - releaseOrder(b.type))
        .map((item) => item.certification)
      : entries.map((item) => item.rating)
    const value = candidates.filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim()).find((item) => VALID[kind][country].includes(item))
    if (value !== undefined) certifications[country] = value
  }
  return certifications
}

/** `vote_average`/`vote_count` do detalhe → `TmdbRating`; ausente quando não vierem números finitos. */
export function tmdbRatingFromTmdb(detail: unknown): TmdbRating | undefined {
  const { vote_average: average, vote_count: votes } = record(detail)
  return typeof average === 'number' && Number.isFinite(average) && typeof votes === 'number' && Number.isFinite(votes)
    ? { average, votes } : undefined
}

/** O valor do país do idioma, ou `null` — nunca o de outro país (FR-004/FR-005). */
export function certificationFor(
  certifications: Certifications | undefined,
  language: AppLanguage,
): { country: CertificationCountry; value: string } | null {
  const country = CERTIFICATION_COUNTRY[language]
  const value = certifications?.[country]
  return typeof value === 'string' && (VALID.movie[country].includes(value) || VALID.tv[country].includes(value))
    ? { country, value } : null
}

/** A média a mostrar, ou `null`: só com média > 0 e votos ≥ `TMDB_MIN_VOTES` (FR-008). */
export function tmdbRatingToShow(rating: TmdbRating | undefined): number | null {
  return rating && Number.isFinite(rating.average) && Number.isFinite(rating.votes)
    && rating.average > 0 && rating.votes >= TMDB_MIN_VOTES ? rating.average : null
}

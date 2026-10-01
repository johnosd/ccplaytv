import type { TitleFields, TrailerVideoRef } from '../catalog/db'
import { normalizeDurationSeconds, normalizeIconUrl } from '../catalog/classifier'
import { isYoutubeVideoId } from '../trailer/trailerCandidates'

/**
 * Normalização da metadata descritiva que o painel Xtream já entrega
 * (feature 032, `data-model.md` §3). Formatos confirmados no painel real em
 * 2026-09-29 — mas tolerante: campo desconhecido, vazio, `"0"` ou lista vazia
 * é **ausente**, nunca erro e nunca um valor de preenchimento (R-003).
 */

export interface NormalizedProviderMetadata {
  fields: TitleFields
  /** `info.tmdb_id`, quando for um inteiro positivo. Só o filme declara. */
  tmdbId?: number
}

/** Texto útil: string não vazia depois de `trim()` e diferente de `"0"`. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' || trimmed === '0' ? undefined : trimmed
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const found = text(value)
    if (found !== undefined) return found
  }
  return undefined
}

/** `backdrop_path` chega como lista de URLs (painel real) ou como uma string só. */
function backdrop(value: unknown): string | undefined {
  const candidates = Array.isArray(value) ? value : [value]
  for (const candidate of candidates) {
    const url = normalizeIconUrl(candidate)
    if (url !== undefined) return url
  }
  return undefined
}

/** `"HH:MM:SS"` → segundos; qualquer outra coisa → `undefined` (nunca `0`). */
function hhMmSs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  return seconds > 0 ? seconds : undefined
}

/** `episode_run_time` é em MINUTOS (número no filme, string na série). */
function minutesToSeconds(value: unknown): number | undefined {
  const seconds = normalizeDurationSeconds(value)
  return seconds === undefined ? undefined : seconds * 60
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * `info.youtube_trailer`: só o id de 11 caracteres vale (feature 033, FR-002).
 * Vazio, `"0"`, URL ou qualquer outra forma é ausente — nunca "consertado".
 */
function providerTrailer(value: unknown): TrailerVideoRef[] | undefined {
  const id = text(value)
  return isYoutubeVideoId(id) ? [{ videoId: id, kind: 'trailer' }] : undefined
}

/** Remove chaves `undefined` — o registro guardado só tem o que existe. */
function compact(fields: TitleFields): TitleFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as TitleFields
}

/** `get_vod_info.info` de um filme. */
export function normalizeVodInfo(info: Record<string, unknown> | undefined): NormalizedProviderMetadata {
  if (!info) return { fields: {} }
  return {
    fields: compact({
      synopsis: firstText(info.plot, info.description),
      backdropUrl: backdrop(info.backdrop_path),
      genres: text(info.genre),
      durationSeconds:
        normalizeDurationSeconds(info.duration_secs) ?? hhMmSs(info.duration) ?? minutesToSeconds(info.episode_run_time),
      director: text(info.director),
      country: text(info.country),
      cast: firstText(info.cast, info.actors),
      trailerVideos: providerTrailer(info.youtube_trailer),
    }),
    tmdbId: positiveInteger(info.tmdb_id),
  }
}

/**
 * `get_series_info.info` de uma série. A duração é a **por episódio**
 * (`episode_run_time`); o painel não declara `country` nem `tmdb_id` no
 * nível da série (medido em 2026-09-29).
 */
export function normalizeSeriesInfo(info: Record<string, unknown> | undefined): NormalizedProviderMetadata {
  if (!info) return { fields: {} }
  return {
    fields: compact({
      synopsis: firstText(info.plot, info.description),
      backdropUrl: backdrop(info.backdrop_path),
      genres: text(info.genre),
      durationSeconds: minutesToSeconds(info.episode_run_time),
      director: text(info.director),
      cast: firstText(info.cast, info.actors),
      trailerVideos: providerTrailer(info.youtube_trailer),
    }),
  }
}

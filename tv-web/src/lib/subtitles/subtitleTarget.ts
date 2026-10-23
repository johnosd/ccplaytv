/**
 * Do item em reprodução ao alvo da busca (feature 090, `logic/legenda-externa.md` §3). `resolveSubtitleTarget` só lê o
 * aparelho (catálogo + metadata), nunca a rede; `buildSearchRequest` (pura) mora em `searchRequest.ts` e é
 * reexportada aqui.
 */
import { db, type CatalogDb, type CatalogRecord } from '../catalog/db'
import { findSeriesRecord, getChannel } from '../catalog/catalogRepository'
import { buildStableId } from '../catalog/userStateRepository'
import { titleStableId } from '../metadata/titleMetadataStore'
import { normalizeTitle, yearHintFromTitle } from '../metadata/tmdbMatch'
import type { SubtitleTarget } from './types'

export { buildSearchRequest, type BuiltSearchRequest } from './searchRequest'

/** TMDB do título guardado no aparelho: o casamento confirmado vence; filme cai no ID declarado pelo painel. */
async function tmdbIdOf(record: CatalogRecord, database: CatalogDb): Promise<number | undefined> {
  const key = titleStableId(record)
  if (!key) return undefined
  const meta = await database.titleMetadata.get(key)
  if (meta?.tmdb?.status === 'matched') return meta.tmdb.tmdbId
  return record.kind === 'movie' ? meta?.providerTmdbId : undefined
}

function cleanTitle(record: CatalogRecord): string {
  return normalizeTitle(record.name || record.originalName)
}

function yearOf(record: CatalogRecord): number | undefined {
  return record.year ?? yearHintFromTitle(record.originalName)
}

export async function resolveSubtitleTarget(itemId: string, database: CatalogDb = db): Promise<SubtitleTarget | null> {
  const id = Number(itemId)
  if (!Number.isFinite(id)) return null
  const record = await getChannel(id, database)
  if (!record || (record.kind !== 'movie' && record.kind !== 'episode')) return null

  let stableId: string
  try {
    stableId = buildStableId({
      sourceId: record.sourceId,
      kind: record.kind,
      providerStreamId: record.providerStreamId,
      seriesId: record.seriesId,
      seasonNumber: record.seasonNumber,
      episodeNumber: record.episodeNumber,
      originalName: record.originalName,
    })
  } catch {
    return null
  }

  if (record.kind === 'movie') {
    const tmdbId = await tmdbIdOf(record, database)
    const title = cleanTitle(record)
    if (title === '' && tmdbId === undefined) return null
    return { stableId, sourceId: record.sourceId, kind: 'movie', title, year: yearOf(record), tmdbId }
  }

  const series = record.seriesId ? await findSeriesRecord(record.sourceId, record.seriesId, database) : undefined
  const parentTmdbId = series ? await tmdbIdOf(series, database) : undefined
  const title = series ? cleanTitle(series) : cleanTitle(record)
  if (title === '' && parentTmdbId === undefined) return null
  return {
    stableId,
    sourceId: record.sourceId,
    kind: 'episode',
    title,
    year: series ? yearOf(series) : undefined,
    parentTmdbId,
    season: record.seasonNumber,
    episode: record.episodeNumber,
    seriesId: record.seriesId,
  }
}

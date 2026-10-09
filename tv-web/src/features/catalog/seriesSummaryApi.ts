import { db, type CatalogDb, type CatalogRecord } from '../../lib/catalog/db'
import { listAllEpisodes } from '../../lib/catalog/catalogRepository'
import { buildStableId, getUserStates } from '../../lib/catalog/userStateRepository'
import {
  listSeriesWatchMembers,
  readValidSeriesWatchSummary,
  storeSeriesWatchMembers,
  storeSeriesWatchSummary,
} from '../../lib/catalog/seriesWatchRepository'
import { summarizeSeriesWatched, type SeriesWatchedSummary } from '../../lib/catalog/seriesWatchedSummary'
import { isQuotaError } from '../../lib/catalog/catalogRepository'

function episodeStableId(sourceId: string, episode: CatalogRecord): string | undefined {
  try {
    return buildStableId({
      sourceId,
      kind: 'episode',
      providerStreamId: episode.providerStreamId,
      seriesId: episode.seriesId,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      originalName: episode.originalName,
    })
  } catch {
    return undefined
  }
}

/** A invalidação por stableId já remove os summaries afetados; não varrer userStates para criar um epoch global. */
function stateRevision(): number {
  return 0
}

async function backfill(sourceId: string, generation: number, database: CatalogDb): Promise<void> {
  const episodes = await listAllEpisodes(sourceId, database)
  const bySeries = new Map<string, string[]>()
  for (const episode of episodes) {
    if (!episode.seriesId) continue
    const stableId = episodeStableId(sourceId, episode)
    if (!stableId) continue
    const list = bySeries.get(episode.seriesId)
    if (list) list.push(stableId)
    else bySeries.set(episode.seriesId, [stableId])
  }
  for (const [seriesId, stableIds] of bySeries) await storeSeriesWatchMembers({ sourceId, generation, seriesId }, stableIds, database)
}

export async function loadSeriesWatchedSummaries(sourceId: string, database: CatalogDb = db): Promise<Map<string, SeriesWatchedSummary>> {
  const source = await database.sources.get(sourceId)
  if (!source?.activeGeneration) return new Map()
  let members = await listSeriesWatchMembers(sourceId, source.activeGeneration, database)
  if (members.length === 0) {
    await backfill(sourceId, source.activeGeneration, database)
    members = await listSeriesWatchMembers(sourceId, source.activeGeneration, database)
  }
  const revision = stateRevision()
  const result = new Map<string, SeriesWatchedSummary>()
  for (const member of members) {
    const target = { sourceId, generation: source.activeGeneration, seriesId: member.seriesId }
    const valid = await readValidSeriesWatchSummary(target, revision, database)
    if (valid) {
      // Uma série conhecida, mas ainda sem nenhum episódio concluído, não
      // exibe selo. O resumo só entra na projeção quando existe progresso
      // observável; a cobertura continua disponível depois do primeiro
      // episódio concluído.
      if (valid.watched > 0) result.set(member.seriesId, valid)
      continue
    }
    const states = await getUserStates(member.stableIds, database)
    const summary = summarizeSeriesWatched(states.map((state) => ({ completedAt: state?.completedAt })))
    if (summary.watched > 0) {
      try {
        await storeSeriesWatchSummary(target, summary, { membersRevision: member.revision, stateRevision: revision }, database)
      } catch (error) {
        if (!isQuotaError(error)) throw error
      }
      result.set(member.seriesId, summary)
    }
  }
  return result
}

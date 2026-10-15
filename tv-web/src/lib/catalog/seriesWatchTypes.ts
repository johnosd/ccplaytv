import type { SeriesWatchedSummary } from './seriesWatchedSummary'

export interface SeriesWatchMemberRecord {
  id?: [string, number, string]
  sourceId: string
  generation: number
  seriesId: string
  revision: number
  stableIds: string[]
}

export interface SeriesWatchSummaryRecord {
  id?: [string, number, string]
  sourceId: string
  generation: number
  seriesId: string
  algorithmVersion: number
  membersRevision: number
  stateRevision: number
  summary: SeriesWatchedSummary
}

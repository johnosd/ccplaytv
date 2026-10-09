import type { CategoryKind } from './db'

export interface CatalogReadItem {
  id: number
  sourceId: string
  generation: number
  kind: CategoryKind
  categoryId: number
  groupOrder: number
  categoryPosition: number
  name: string
  originalName: string
  group?: string
  providerStreamId?: string
  seriesId?: string
  iconUrl?: string
  year?: number
  addedAt?: number
  providerRating?: number
  providerGenres?: string
  providerBackdropUrl?: string
  epgChannelId?: string
  archiveDays?: number
  hasPlayback: boolean
}

export interface CatalogReadManifest {
  categoryId: number
  sourceId: string
  generation: number
  kind: CategoryKind
  revision: string
  formatVersion: number
  count: number
  chunkSize: number
  chunkCount: number
  ready: boolean
}

export interface CatalogReadChunk {
  id: [number, string, number]
  categoryId: number
  sourceId: string
  generation: number
  kind: CategoryKind
  revision: string
  chunk: number
  items: CatalogReadItem[]
}

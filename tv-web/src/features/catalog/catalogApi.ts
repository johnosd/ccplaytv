import { useQuery } from '@tanstack/react-query'
import { db } from '../../lib/catalog/db'
import { listCategories, listChannels } from '../../lib/catalog/catalogRepository'
import { resolvePlaybackUrl } from '../../lib/catalog/playbackUrl'

export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

export interface CatalogItemOut {
  id: string
  kind: CatalogItemKind
  name: string
  original_group: string | null
  published: boolean
  playable: boolean
}

export interface CatalogItemListResponse {
  items: CatalogItemOut[]
  next_cursor: string | null
}

export interface CatalogItemPlayback {
  item_id: string
  kind: CatalogItemKind
  url: string
  container_hint: string | null
}

export class CatalogApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function useChannels(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-items', sourceId, 'channel'],
    queryFn: async () => {
      if (!sourceId) return { items: [], next_cursor: null } satisfies CatalogItemListResponse

      const categories = await listCategories(sourceId)
      const items: CatalogItemOut[] = []

      for (const category of categories) {
        const channels = await listChannels(sourceId, category.order, 0, category.count)
        for (const channel of channels) {
          items.push({
            id: String(channel.id ?? ''),
            kind: 'channel',
            name: channel.name,
            original_group: channel.group ?? null,
            published: true,
            playable: Boolean(channel.directUrl) || Boolean(channel.providerStreamId),
          })
        }
      }

      return { items, next_cursor: null } satisfies CatalogItemListResponse
    },
    enabled: sourceId !== null,
  })
}

export async function fetchPlayback(itemId: string): Promise<CatalogItemPlayback> {
  const channelId = Number(itemId)
  const url = await resolvePlaybackUrl(channelId, db)
  return {
    item_id: itemId,
    kind: 'channel',
    url,
    container_hint: null,
  }
}

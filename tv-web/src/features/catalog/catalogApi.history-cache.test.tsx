import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  useFavoritesContent,
  useHistoryContent,
  useHistorySummary,
} from './catalogApi'
import { db } from '../../lib/catalog/db'

const SOURCE_ID = 'source-history-cache-065'

function wrapperOf(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

async function seedCatalogAndState(): Promise<void> {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte de teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
  await db.channels.bulkAdd([
    {
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Filme recente',
      originalName: 'Filme recente',
      groupOrder: 0,
      providerStreamId: 'recent',
    },
    {
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Filme antigo',
      originalName: 'Filme antigo',
      groupOrder: 0,
      providerStreamId: 'old',
    },
  ])
  await db.userStates.bulkPut([
    {
      stableId: `${SOURCE_ID}|movie|id:recent`,
      sourceId: SOURCE_ID,
      isFavorite: false,
      lastWatched: 200,
      createdAt: 1,
      updatedAt: 200,
    },
    {
      stableId: `${SOURCE_ID}|movie|id:old`,
      sourceId: SOURCE_ID,
      isFavorite: true,
      favoritedAt: 300,
      lastWatched: 100,
      createdAt: 1,
      updatedAt: 300,
    },
  ])
}

afterEach(async () => {
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('histórico/favoritos após coleta do cache (feature 065, T031)', () => {
  it('reidrata itens e contadores da fonte depois de o QueryCache ser coletado', async () => {
    await seedCatalogAndState()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = wrapperOf(client)
    const first = renderHook(
      () => ({
        history: useHistoryContent(SOURCE_ID, 'movie', true),
        favorites: useFavoritesContent(SOURCE_ID, 'movie', true),
        summary: useHistorySummary(SOURCE_ID, true),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(first.result.current.history.data?.items).toHaveLength(2)
      expect(first.result.current.favorites.data?.items).toHaveLength(1)
      expect(first.result.current.summary.data?.movies.titles).toBe(2)
    })
    expect(first.result.current.history.data?.items.map((item) => item.name)).toEqual(['Filme recente', 'Filme antigo'])
    expect(first.result.current.favorites.data?.items.map((item) => item.name)).toEqual(['Filme antigo'])
    expect(first.result.current.summary.data?.movies).toEqual({ titles: 2, unavailable: 0, hasProgress: false })

    first.unmount()
    // Simula o mesmo descarte que o gcTime de 30 s faz, sem depender de
    // timers reais no teste: persistência local continua sendo a fonte da verdade.
    client.removeQueries({ queryKey: ['history-content', SOURCE_ID, 'movie'] })
    client.removeQueries({ queryKey: ['favorites-content', SOURCE_ID, 'movie'] })
    client.removeQueries({ queryKey: ['history-summary', SOURCE_ID] })
    expect(client.getQueryData(['history-content', SOURCE_ID, 'movie'])).toBeUndefined()
    expect(client.getQueryData(['favorites-content', SOURCE_ID, 'movie'])).toBeUndefined()
    expect(client.getQueryData(['history-summary', SOURCE_ID])).toBeUndefined()

    const second = renderHook(
      () => ({
        history: useHistoryContent(SOURCE_ID, 'movie', true),
        favorites: useFavoritesContent(SOURCE_ID, 'movie', true),
        summary: useHistorySummary(SOURCE_ID, true),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(second.result.current.history.data?.items.map((item) => item.name)).toEqual(['Filme recente', 'Filme antigo'])
      expect(second.result.current.favorites.data?.items.map((item) => item.name)).toEqual(['Filme antigo'])
      expect(second.result.current.summary.data?.movies.titles).toBe(2)
    })
  })
})

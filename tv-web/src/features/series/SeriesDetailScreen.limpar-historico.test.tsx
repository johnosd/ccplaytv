/** Feature 036 (T022): "Remover do histórico" no detalhe de série — a série inteira. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { buildStableId, getUserState, listPlayed, markCompleted, updateProgress } from '../../lib/catalog/userStateRepository'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useSeriesEpisodes: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({ PlayerLayer: () => null }))
vi.mock('../../components/TrailerLayer', () => ({ TrailerLayer: () => null }))

// Mesmo stub de layout de `SeriesDetailScreen.test.tsx` (lista de episódios virtualizada).
const restorers: Array<() => void> = []
beforeAll(() => {
  for (const [target, key, value] of [
    [HTMLElement.prototype, 'offsetHeight', 800],
    [HTMLElement.prototype, 'offsetWidth', 1200],
  ] as const) {
    const previous = Object.getOwnPropertyDescriptor(target, key)
    Object.defineProperty(target, key, { configurable: true, value })
    restorers.push(() => {
      if (previous) Object.defineProperty(target, key, previous)
    })
  }
})
afterAll(() => {
  for (const restore of restorers.reverse()) restore()
})

const SOURCE_ID = 'src-036-serie'

const SERIES: CatalogItemOut = {
  id: 'series-1',
  kind: 'series',
  name: 'Breaking Bad',
  original_group: 'Drama',
  published: true,
  playable: false,
  source_id: SOURCE_ID,
  original_name: 'Breaking Bad',
  series_id: '200',
}

function episode(id: string, season: number, number: number): EpisodeOut {
  return {
    id,
    name: `Ep ${id}`,
    season_number: season,
    episode_number: number,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: id,
    series_id: '200',
    original_name: `Ep ${id}`,
  }
}

const EPISODES = [episode('1001', 1, 1), episode('2001', 2, 1)]
const stableIdOf = (ep: EpisodeOut) =>
  buildStableId({
    sourceId: SOURCE_ID,
    kind: 'episode',
    providerStreamId: ep.provider_stream_id ?? undefined,
    seasonNumber: ep.season_number ?? undefined,
    episodeNumber: ep.episode_number ?? undefined,
  })

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const actionLabels = () => [...document.querySelectorAll('.vod-detail-action')].map((el) => el.textContent)

describe('SeriesDetailScreen — Remover do histórico (feature 036)', () => {
  beforeEach(async () => {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    // `removeSeriesFromHistory` resolve os episódios pelo catálogo gravado (D-009).
    await db.channels.bulkAdd(
      EPISODES.map((ep) => ({
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'episode' as const,
        name: ep.name,
        originalName: ep.original_name,
        groupOrder: 0,
        seriesId: '200',
        providerStreamId: ep.provider_stream_id ?? undefined,
        seasonNumber: ep.season_number ?? undefined,
        episodeNumber: ep.episode_number ?? undefined,
      })),
    )
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: SERIES, isLoading: false } as ReturnType<
      typeof catalogApi.useCatalogItem
    >)
    vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue({
      data: { episodes: EPISODES, outcome: 'fresh' },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>)
  })

  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  function renderScreen() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <SeriesDetailScreen seriesId="series-1" onBack={() => {}} />
      </QueryClientProvider>,
    )
  }

  it('sem episódio no Histórico, a ação não existe', async () => {
    renderScreen()
    await waitFor(() => expect(actionLabels()).toContain('☰ Semelhantes'))
    expect(actionLabels()).not.toContain('Remover do histórico')
  })

  it('com episódio no Histórico: ação por último; remove todos os episódios e mantém "assistido"', async () => {
    await markCompleted(stableIdOf(EPISODES[0]), SOURCE_ID)
    await updateProgress(stableIdOf(EPISODES[0]), SOURCE_ID, 0)
    await updateProgress(stableIdOf(EPISODES[1]), SOURCE_ID, 300)
    renderScreen()

    await waitFor(() => expect(actionLabels().at(-1)).toBe('Remover do histórico'))
    for (let i = 0; i < 10; i += 1) press('ArrowRight')
    press('Enter')
    await screen.findByRole('dialog', { name: 'Remover "Breaking Bad" do histórico?' })
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1) // SC-004
    press('ArrowRight')
    press('Enter')

    await waitFor(() => expect(actionLabels()).not.toContain('Remover do histórico'))
    expect(await listPlayed(SOURCE_ID, 'episode', db)).toEqual([])
    expect((await getUserState(stableIdOf(EPISODES[0]), db))?.completedAt).toBeDefined()
    expect(await getUserState(stableIdOf(EPISODES[1]), db)).toMatchObject({ progressSeconds: 300 })
  })
})

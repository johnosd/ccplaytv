import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'

// Feature 059 (detalhe Cinema), US2 — testes de apoio, fora do contrato travado.

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useSeriesEpisodes: vi.fn(), useTitleMetadata: vi.fn(), useTmdbStatus: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(({ title }: { title: string }) => <div role="dialog" aria-label={`Reproduzindo ${title}`} />),
}))

const SERIES: CatalogItemOut = {
  id: 'series-1',
  kind: 'series',
  name: 'Breaking Bad',
  original_group: 'Séries Drama',
  published: true,
  playable: false,
  source_id: 'src1',
  provider_stream_id: undefined,
  original_name: 'Breaking Bad',
  series_id: '200',
  year: 2008,
}

function episode(overrides: Partial<EpisodeOut>): EpisodeOut {
  return {
    id: '1001',
    name: 'Piloto',
    season_number: 1,
    episode_number: 1,
    playable: true,
    source_id: 'src1',
    provider_stream_id: '1001',
    series_id: '200',
    original_name: 'Piloto',
    ...overrides,
  }
}

const S1E1 = episode({ id: '1001', name: 'Piloto', provider_stream_id: '1001' })
const S2E1 = episode({ id: '2001', name: 'Seven Thirty-Seven', season_number: 2, provider_stream_id: '2001', original_name: 'Seven Thirty-Seven' })

function stableIdOfEpisode(ep: EpisodeOut) {
  return buildStableId({
    sourceId: ep.source_id,
    kind: 'episode',
    providerStreamId: ep.provider_stream_id ?? undefined,
    seriesId: ep.series_id,
    seasonNumber: ep.season_number ?? undefined,
    episodeNumber: ep.episode_number ?? undefined,
    originalName: ep.original_name,
  })
}

function episodes(list: EpisodeOut[]) {
  vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue({
    data: { episodes: list, outcome: 'fresh' },
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>)
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <SeriesDetailScreen seriesId="series-1" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: SERIES, isLoading: false } as ReturnType<typeof catalogApi.useCatalogItem>)
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({
    data: { genres: { value: 'Drama, Crime', origin: 'tmdb' } },
    isLoading: false,
    isFetching: false,
  } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>)
  vi.mocked(catalogApi.useTmdbStatus).mockReturnValue({ data: { state: 'connected' } } as unknown as ReturnType<
    typeof catalogApi.useTmdbStatus
  >)
  episodes([S1E1, S2E1])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SeriesDetailScreen — hero Cinema (feature 059)', () => {
  it('nada assistido: "Assistir T1:E1" focado e sem barra; metadata com ano e temporadas, categoria só no chip', () => {
    renderScreen()
    const primary = screen.getByText('▶ Assistir T1:E1')
    expect(primary.className).toContain('tv-focus')
    expect(within(primary).queryByRole('progressbar')).not.toBeInTheDocument()

    const meta = document.querySelector('.vod-detail-meta')
    expect(meta?.textContent).toContain('2008')
    expect(meta?.textContent).toContain('2 temporadas')
    expect(meta?.textContent).not.toContain('Séries Drama')
    const chips = within(screen.getByRole('list', { name: 'Categoria e gêneros' })).getAllByRole('listitem')
    expect(chips.map((chip) => chip.textContent)).toEqual(['Séries Drama', 'Drama', 'Crime'])
  })

  it('episódio em andamento sem duração conhecida: "Continuar" sem barra nem "faltam"', async () => {
    await updateProgress(stableIdOfEpisode(S1E1), 'src1', 600)
    renderScreen()
    const primary = await screen.findByText('▶ Continuar T1:E1')
    expect(within(primary).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/^faltam/)).not.toBeInTheDocument()
  })

  it('a capa do hero é um pôster simples (sem o título repetido de um card) e o seletor de temporada continua abrindo', () => {
    renderScreen()
    expect(document.querySelector('.vod-detail-hero .content-card')).toBeNull()
    expect(document.querySelector('.vod-detail-poster .poster-box')).not.toBeNull()

    press('ArrowDown') // aba Episódios
    press('ArrowDown') // botão da temporada
    press('Enter')
    expect(screen.getByRole('dialog', { name: 'Selecionar temporada' })).toBeInTheDocument()
  })
})

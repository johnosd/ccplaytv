/**
 * Contrato da feature 059 (detalhe Cinema) — travado em
 * `sdd/specs/059-detalhe-cinema-filme-serie/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/hero-cinema.md` §3 e §4.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'

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

const S1E1 = episode({ id: '1001', name: 'Piloto', episode_number: 1, provider_stream_id: '1001', duration_seconds: 2400 })
const S1E2 = episode({ id: '1002', name: 'Cat in the Bag', episode_number: 2, provider_stream_id: '1002', original_name: 'Cat in the Bag', duration_seconds: 2400 })

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

const focused = (text: string) => screen.getByText(text).className.includes('tv-focus')

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: SERIES, isLoading: false } as ReturnType<
    typeof catalogApi.useCatalogItem
  >)
  vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue({
    data: { episodes: [S1E1, S1E2], outcome: 'fresh' },
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>)
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data: {}, isLoading: false, isFetching: false } as unknown as ReturnType<
    typeof catalogApi.useTitleMetadata
  >)
  vi.mocked(catalogApi.useTmdbStatus).mockReturnValue({ data: { state: 'connected' } } as unknown as ReturnType<
    typeof catalogApi.useTmdbStatus
  >)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SeriesDetailScreen — contrato da feature 059 (detalhe Cinema)', () => {
  // US2/AC1+AC3; FR-007, FR-008, FR-009; Constitution: "Progresso e Capacidades São Reais, Nunca Prometidos"
  it('episódio em andamento com duração conhecida: primária focada com a barra e o "faltam" DO EPISÓDIO; ícones da série sem Reiniciar nem Marcar assistido', async () => {
    await updateProgress(stableIdOfEpisode(S1E1), 'src1', 1200) // metade do Piloto
    renderScreen()

    const primary = await screen.findByText('▶ Continuar T1:E1')
    expect(primary.className).toContain('tv-focus')
    expect(within(primary).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(within(primary).getByText('faltam 20 min')).toBeInTheDocument()

    for (const label of ['+ Minha Lista', 'Trailer — indisponível', '☰ Semelhantes', 'Remover do histórico']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
      press('ArrowRight')
      expect(focused(label)).toBe(true)
    }
    expect(screen.queryByText('↺ Reiniciar')).not.toBeInTheDocument()
    expect(screen.queryByText('✓ Marcar como assistido')).not.toBeInTheDocument()
  })
})

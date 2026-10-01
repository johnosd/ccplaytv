import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen, type SeriesDetailScreenProps } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut } from '../catalog/catalogApi'
import type { ResolvedTitle, SimilarTabView } from '../../lib/metadata/types'
import { findUnnamedControls } from '../../testing/accessibleNames'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useSeriesEpisodes: vi.fn(), useSimilarTitles: vi.fn(), useTitleMetadata: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({ PlayerLayer: () => <div role="dialog" aria-label="Player" /> }))

const SERIES: CatalogItemOut = {
  id: 'series-1',
  kind: 'series',
  name: 'Dark',
  original_group: 'Drama',
  published: true,
  playable: false,
  source_id: 'src1',
  original_name: 'Dark',
  series_id: '200',
}

const EPISODE: EpisodeOut = {
  id: '1001',
  name: 'Segredos',
  season_number: 1,
  episode_number: 1,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '1001',
  series_id: '200',
  original_name: 'Segredos',
}

const FOUND: ResolvedTitle = { key: 'tmdb:series:1', tmdbId: 1, kind: 'series', title: 'Outra série', year: 2019, localItemId: 'series-2' }
const MISSING: ResolvedTitle = { key: 'tmdb:series:2', tmdbId: 2, kind: 'series', title: 'Ausente', year: 2020 }

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function similarView(view: SimilarTabView) {
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue(view)
}

function renderScreen(props: Partial<SeriesDetailScreenProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <SeriesDetailScreen seriesId="series-1" onBack={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

/** ações → abas (Episódios) → Detalhes → Elenco → Semelhantes, OK. */
function openSimilarTab() {
  press('ArrowDown')
  press('ArrowRight')
  press('ArrowRight')
  press('ArrowRight')
  press('Enter')
}

beforeEach(() => {
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: SERIES, isLoading: false } as ReturnType<typeof catalogApi.useCatalogItem>)
  vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue({
    data: { episodes: [EPISODE], outcome: 'fetched' },
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>)
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data: { tmdbMatch: 'matched' }, isLoading: false } as unknown as ReturnType<
    typeof catalogApi.useTitleMetadata
  >)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SeriesDetailScreen — aba Semelhantes (feature 035)', () => {
  it('a aba é real, mostra a cobertura em séries e OK abre o detalhe encontrado ou o resumo do não encontrado', () => {
    similarView({ status: 'ready', titles: [FOUND, MISSING], coverage: { covered: 1, total: 4 } })
    const onOpenTitle = vi.fn()
    renderScreen({ onOpenTitle })

    openSimilarTab()
    expect(screen.getByRole('tab', { name: 'Semelhantes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Procurado em 1 de 4 categorias de séries')).toBeInTheDocument()

    press('ArrowDown')
    press('Enter')
    expect(onOpenTitle).toHaveBeenCalledWith({ kind: 'series', itemId: 'series-2' }, { tab: 'similar', focusKey: 'tmdb:series:1' })

    press('ArrowRight')
    press('Enter')
    expect(within(screen.getByRole('dialog')).getByText('Ausente')).toBeInTheDocument()
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restore com aba similar e chave monta já no cartão; sem restore a aba inicial continua Episódios', () => {
    similarView({ status: 'ready', titles: [FOUND, MISSING], coverage: { covered: 1, total: 4 } })
    renderScreen({ restore: { tab: 'similar', focusKey: 'tmdb:series:2' } })
    expect(screen.getByRole('tab', { name: 'Semelhantes' })).toHaveAttribute('aria-selected', 'true')
    press('Enter')
    expect(within(screen.getByRole('dialog')).getByText('Ausente')).toBeInTheDocument()

    cleanup()
    similarView({ status: 'ready', titles: [], coverage: undefined })
    renderScreen()
    expect(screen.getByRole('tab', { name: 'Episódios' })).toHaveAttribute('aria-selected', 'true')
  })

  it('sem chave: explica e "Configurar TMDB" é focável e abre Integrações; TMDB indisponível: mensagem própria, foco na aba', () => {
    similarView({ status: 'no_key', titles: [] })
    const onOpenTmdbSettings = vi.fn()
    renderScreen({ onOpenTmdbSettings })
    openSimilarTab()
    press('ArrowDown')
    expect(screen.getByRole('button', { name: 'Configurar TMDB' }).className).toContain('tv-focus')
    press('Enter')
    expect(onOpenTmdbSettings).toHaveBeenCalledWith({ tab: 'similar' })
    expect(findUnnamedControls(document.body)).toEqual([])

    cleanup()
    similarView({ status: 'unavailable', titles: [] })
    renderScreen()
    openSimilarTab()
    expect(screen.getByText(/Semelhantes está indisponível agora/)).toBeInTheDocument()
    press('ArrowDown')
    expect(screen.getByRole('tab', { name: 'Semelhantes' }).className).toContain('tv-focus')
    expect(findUnnamedControls(document.body)).toEqual([])
  })
})

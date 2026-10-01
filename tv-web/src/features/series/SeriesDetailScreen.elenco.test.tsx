import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen, type SeriesDetailScreenProps } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut } from '../catalog/catalogApi'
import type { TitleMetadataView } from '../../lib/metadata/types'
import { findUnnamedControls } from '../../testing/accessibleNames'

/** Feature 035 (US3) — aba Elenco da série com foto/personagem (aggregate_credits). */
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useSeriesEpisodes: vi.fn(), useTitleMetadata: vi.fn(), useSimilarTitles: vi.fn() }
})
vi.mock('../../components/PlayerLayer', () => ({ PlayerLayer: () => <div role="dialog" aria-label="Reproduzindo" /> }))

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

const WITH_PEOPLE: TitleMetadataView = {
  tmdbMatch: 'matched',
  castPeople: [
    { personId: 1, name: 'Louis Hofmann', character: 'Jonas', photoUrl: 'https://image.tmdb.org/t/p/w185/l.jpg' },
    { personId: 2, name: 'Lisa Vicari' },
  ],
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function metadata(view: TitleMetadataView | undefined) {
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data: view } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>)
}

function renderScreen(props: Partial<SeriesDetailScreenProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SeriesDetailScreen seriesId="series-1" onBack={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

/** ações → abas (Episódios) → Detalhes → Elenco, OK. */
function openCastTab() {
  press('ArrowDown')
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
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue({ status: 'loading', titles: [] })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SeriesDetailScreen — Elenco com foto (feature 035)', () => {
  it('com casamento mostra as pessoas; foto que falha vira o marcador neutro', () => {
    metadata(WITH_PEOPLE)
    const { container } = renderScreen()
    openCastTab()

    expect(screen.getByText('Louis Hofmann')).toBeInTheDocument()
    expect(screen.getByText('Jonas')).toBeInTheDocument()
    expect(container.querySelectorAll('.cast-person-character')).toHaveLength(1)
    expect(findUnnamedControls(container)).toEqual([])

    fireEvent.error(container.querySelector('img.person-photo-img') as HTMLImageElement)
    expect(container.querySelector('img.person-photo-img')).toBeNull()
  })

  it('↓ entra nas pessoas, OK chama onOpenPerson com aba e chave; restore focaliza a pessoa por identidade', () => {
    metadata(WITH_PEOPLE)
    const onOpenPerson = vi.fn()
    renderScreen({ onOpenPerson })
    openCastTab()
    press('ArrowDown')
    press('ArrowRight')
    press('Enter')
    expect(onOpenPerson).toHaveBeenCalledWith({ personId: 2, name: 'Lisa Vicari' }, { tab: 'cast', focusKey: 'person:2' })

    cleanup()
    onOpenPerson.mockClear()
    renderScreen({ onOpenPerson, restore: { tab: 'cast', focusKey: 'person:1' } })
    press('Enter')
    expect(onOpenPerson).toHaveBeenCalledWith({ personId: 1, name: 'Louis Hofmann' }, { tab: 'cast', focusKey: 'person:1' })
  })

  it('sem castPeople continua o texto da 032 e o foco fica na aba', () => {
    metadata({ cast: { value: 'Ator Um, Atriz Dois', origin: 'provider' } })
    renderScreen()
    openCastTab()
    expect(screen.getByText('Ator Um')).toBeInTheDocument()
    press('ArrowDown')
    expect(screen.getByRole('tab', { name: 'Elenco' }).className).toContain('tv-focus')
  })
})

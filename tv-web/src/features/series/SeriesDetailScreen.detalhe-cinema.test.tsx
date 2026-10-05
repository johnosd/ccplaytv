import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen, type SeriesDetailScreenProps } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut } from '../catalog/catalogApi'
import type { ResolvedTitle } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'

// Feature 059 (detalhe Cinema), US2 — testes de apoio, fora do contrato travado.

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCatalogItem: vi.fn(),
    useSeriesEpisodes: vi.fn(),
    useTitleMetadata: vi.fn(),
    useTmdbStatus: vi.fn(),
    useSimilarTitles: vi.fn(),
  }
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

function renderScreen(props: Partial<SeriesDetailScreenProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <SeriesDetailScreen seriesId="series-1" onBack={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

const FOUND: ResolvedTitle = { key: 'tmdb:series:1', tmdbId: 1, kind: 'series', title: 'Better Call Saul', year: 2015, localItemId: 'series-2' }
const FOUND_2: ResolvedTitle = { key: 'tmdb:series:2', tmdbId: 2, kind: 'series', title: 'Ozark', year: 2017, localItemId: 'series-3' }
const MISSING: ResolvedTitle = { key: 'tmdb:series:9', tmdbId: 9, kind: 'series', title: 'Ausente', year: 2019, overview: 'Fora da lista.' }

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
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue({ status: 'loading', titles: [] })
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

  it('Semelhantes da série em duas linhas: → para na ponta, ↓ cai na linha "Não encontrados", ↑↑ volta à aba (US3, FR-016)', () => {
    vi.mocked(catalogApi.useSimilarTitles).mockReturnValue({ status: 'ready', titles: [FOUND, FOUND_2, MISSING], coverage: { covered: 2, total: 2 } })
    const onOpenTitle = vi.fn()
    renderScreen({ onOpenTitle })
    press('ArrowDown') // aba Episódios
    for (let i = 0; i < 3; i++) press('ArrowRight') // → Semelhantes
    press('Enter')

    press('ArrowDown') // Better Call Saul
    press('ArrowRight') // Ozark
    press('ArrowRight') // ponta: continua em Ozark
    press('Enter')
    expect(onOpenTitle).toHaveBeenLastCalledWith({ kind: 'series', itemId: 'series-3' }, { tab: 'similar', focusKey: 'tmdb:series:2' })

    press('ArrowDown') // Ausente (coluna limitada à linha de baixo)
    press('Enter')
    expect(within(screen.getByRole('dialog')).getByText('Ausente')).toBeInTheDocument()
    press('Escape')

    press('ArrowUp')
    press('ArrowUp')
    expect(screen.getByRole('tab', { name: 'Semelhantes' }).className).toContain('tv-focus')
  })

  it('cartões de Detalhes da série: fatos do catálogo com "Dados: fonte", gênero do TMDB com "Dados: TMDB" (D-006)', () => {
    renderScreen()
    press('ArrowDown') // aba Episódios
    press('ArrowRight') // Detalhes
    press('Enter')
    const card = (label: string) => screen.getByText(label).closest('.vod-detail-fact') as HTMLElement
    expect(card('Temporadas conhecidas').textContent).toContain('Dados: fonte')
    expect(card('Categoria').textContent).toContain('Dados: fonte')
    expect(card('Gênero').textContent).toContain('Dados: TMDB')
  })

  it('voltar com um cartão da 2ª linha restaura a aba e o mesmo cartão, por identidade (FR-019)', () => {
    vi.mocked(catalogApi.useSimilarTitles).mockReturnValue({ status: 'ready', titles: [FOUND, MISSING], coverage: { covered: 2, total: 2 } })
    renderScreen({ restore: { tab: 'similar', focusKey: MISSING.key } })
    expect(screen.getByRole('tab', { name: 'Semelhantes' })).toHaveAttribute('aria-selected', 'true')
    press('Enter')
    expect(within(screen.getByRole('dialog')).getByText('Ausente')).toBeInTheDocument()
  })
})

/**
 * Contrato da feature 061 (classificação indicativa e nota TMDB) — travado em
 * `sdd/specs/061-classificacao-nota-tmdb/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/classificacao-e-nota.md` §3 e §6.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import type { TitleMetadataView } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'
import { resetAppLanguageForTests } from '../../lib/i18n/appLanguage'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useTitleMetadata: vi.fn(), useSimilarTitles: vi.fn(), useTmdbStatus: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(() => <div role="dialog" />),
}))

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Matrix',
  original_group: 'Lançamentos 2024',
  published: true,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '100',
  original_name: 'Matrix',
  year: 1999,
  provider_rating: 7.4,
}

function metadata(data: TitleMetadataView) {
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data, isLoading: false, isFetching: false } as unknown as ReturnType<
    typeof catalogApi.useTitleMetadata
  >)
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MovieDetailScreen movieId="movie-1" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  window.localStorage.clear()
  resetAppLanguageForTests()
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<typeof catalogApi.useCatalogItem>)
  vi.mocked(catalogApi.useTmdbStatus).mockReturnValue({ data: { state: 'connected' } } as unknown as ReturnType<
    typeof catalogApi.useTmdbStatus
  >)
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue({ status: 'loading', titles: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MovieDetailScreen — contrato da feature 061', () => {
  // US1/AC1+AC3, FR-009, FR-010, FR-016; Constitution: "Categorias da Fonte São Preservadas" (cada nota com a sua origem)
  it('hero: "★ 7,4 Provedor", depois o selo da classificação e "TMDB 7,8", na ordem do protótipo; abaixo do mínimo de votos a nota TMDB some e a do provedor fica', async () => {
    metadata({ tmdbMatch: 'matched', certifications: { BR: '14' }, tmdbRating: { average: 7.83, votes: 1200 } })
    renderScreen()

    const badge = await screen.findByLabelText('Classificação indicativa: 14 anos')
    const meta = badge.closest('.vod-detail-meta') as HTMLElement
    expect(meta).not.toBeNull()
    const text = meta.textContent ?? ''
    const provider = text.indexOf('7,4')
    const rating = text.indexOf('14')
    const tmdb = text.indexOf('TMDB 7,8')
    expect(text).toContain('Provedor')
    expect(provider).toBeGreaterThanOrEqual(0)
    expect(rating).toBeGreaterThan(provider)
    expect(tmdb).toBeGreaterThan(rating)

    cleanup()
    metadata({ tmdbMatch: 'matched', certifications: { BR: '14' }, tmdbRating: { average: 9.8, votes: 12 } })
    renderScreen()
    await screen.findByLabelText('Classificação indicativa: 14 anos')
    expect(screen.queryByText(/TMDB/)).not.toBeInTheDocument()
    expect(screen.getByText(/7,4/)).toBeInTheDocument()
  })
})

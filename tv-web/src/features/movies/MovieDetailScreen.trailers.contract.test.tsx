/**
 * Contrato da feature 033 (trailers) — travado em
 * `sdd/specs/033-trailers-filmes-series/contract-tests.lock`. O sdd-execute
 * só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/botao-trailer.md`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import type { TitleMetadataView } from '../../lib/metadata/types'
import { TrailerLayer } from '../../components/TrailerLayer'
import { db } from '../../lib/catalog/db'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useTitleMetadata: vi.fn(), useTmdbStatus: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(({ title }: { title: string }) => <div role="dialog" aria-label={`Reproduzindo ${title}`} />),
}))

vi.mock('../../components/TrailerLayer', () => ({
  TrailerLayer: vi.fn(({ title, onClose }: { title: string; onClose: () => void }) => (
    <div role="dialog" aria-label={`Trailer de ${title}`}>
      <button type="button" onClick={onClose}>
        Fechar trailer
      </button>
    </div>
  )),
}))

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Duna',
  original_group: 'Ficção científica',
  published: true,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '100',
  original_name: 'Duna',
  year: 2021,
}

function metadataResult(data: TitleMetadataView | undefined, fetching: boolean) {
  return {
    data,
    isPending: data === undefined,
    isLoading: data === undefined && fetching,
    isFetching: fetching,
  } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Ações sem progresso: [Assistir] [Minha Lista] [Trailer] [Marcar assistido] — o Trailer é o índice 2. */
function focusTrailer() {
  press('ArrowRight')
  press('ArrowRight')
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
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<
    typeof catalogApi.useCatalogItem
  >)
  vi.mocked(catalogApi.useTmdbStatus).mockReturnValue({
    data: { state: 'not_configured' },
  } as unknown as ReturnType<typeof catalogApi.useTmdbStatus>)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MovieDetailScreen — botão Trailer, contrato da feature 033', () => {
  // FR-001/FR-006/FR-008 (três estados, mesmo lugar, dica do TMDB sem chave), FR-009/FR-014 (abre o 1º candidato, fechar devolve o foco ao botão), FR-016 + Constitution: "Trailers e Metadados Não Alteram o Estado Principal da Obra"
  it('"Trailer…" enquanto consulta; indisponível sugere o TMDB sem chave; disponível abre o trailer do 1º candidato e fechar devolve o foco ao botão, sem tocar no estado do usuário', async () => {
    vi.mocked(catalogApi.useTitleMetadata).mockReturnValue(metadataResult(undefined, true))
    renderScreen()
    const checking = screen.getByText('Trailer…')
    expect(checking.className).toContain('is-soft-disabled')
    focusTrailer()
    expect(checking.className).toContain('tv-focus')
    press('Enter')
    expect(screen.getByText(/Consultando trailer/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /Trailer de/ })).not.toBeInTheDocument()

    cleanup()
    vi.mocked(catalogApi.useTitleMetadata).mockReturnValue(
      metadataResult({ synopsis: { value: 'Sinopse.', origin: 'provider' } }, false),
    )
    renderScreen()
    const unavailable = screen.getByText('Trailer — indisponível')
    expect(unavailable.className).toContain('is-soft-disabled')
    focusTrailer()
    press('Enter')
    expect(screen.getByText(/Integrações/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /Trailer de/ })).not.toBeInTheDocument()

    cleanup()
    vi.mocked(catalogApi.useTitleMetadata).mockReturnValue(
      metadataResult(
        {
          trailers: [
            { videoId: 'provTrail01', kind: 'trailer', origin: 'provider' },
            { videoId: 'trailerPt01', kind: 'trailer', language: 'pt', official: true, origin: 'tmdb' },
          ],
        },
        false,
      ),
    )
    renderScreen()
    const available = screen.getByText('▶ Trailer')
    expect(available.className).not.toContain('is-soft-disabled')
    focusTrailer()
    press('Enter')
    expect(screen.getByRole('dialog', { name: 'Trailer de Duna' })).toBeInTheDocument()
    const props = vi.mocked(TrailerLayer).mock.calls.at(-1)?.[0]
    expect(props?.candidates[0]?.videoId).toBe('provTrail01')

    act(() => {
      screen.getByRole('button', { name: 'Fechar trailer' }).click()
    })
    expect(screen.queryByRole('dialog', { name: /Trailer de/ })).not.toBeInTheDocument()
    expect(screen.getByText('▶ Trailer').className).toContain('tv-focus')
    expect(await db.userStates.count()).toBe(0)
  })
})

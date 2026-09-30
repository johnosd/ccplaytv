/**
 * Contrato da feature 032 (detalhe com metadata) — travado em
 * `sdd/specs/032-metadata-tmdb-integracoes/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/detalhe-com-metadata.md`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import type { TitleMetadataView } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useTitleMetadata: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(({ title }: { title: string }) => <div role="dialog" aria-label={`Reproduzindo ${title}`} />),
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

const LONG_SYNOPSIS = `Paul Atreides, um jovem brilhante, precisa viajar ao planeta mais perigoso do universo. ${'Uma frase a mais para a sinopse passar do limite do hero. '.repeat(8)}Fim da sinopse.`

function metadataResult(data: TitleMetadataView | undefined) {
  return { data, isLoading: data === undefined } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>
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
      <MovieDetailScreen movieId="movie-1" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<
    typeof catalogApi.useCatalogItem
  >)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MovieDetailScreen — contrato da feature 032', () => {
  // US1/AC4 + FR-005 (metadata nunca atrasa "Assistir"); US1/AC1-AC2 + FR-003/FR-004 (sinopse no hero, "Ver mais" focável, modal, RETURN devolve o foco)
  it('com metadata pendente "Assistir" já toca; com sinopse longa, "Ver mais" abre a sinopse completa e RETURN devolve o foco a ele', () => {
    vi.mocked(catalogApi.useTitleMetadata).mockReturnValue(metadataResult(undefined))
    renderScreen()

    expect(screen.getByText('▶ Assistir').className).toContain('tv-focus')
    press('Enter')
    expect(screen.getByRole('dialog', { name: 'Reproduzindo Duna' })).toBeInTheDocument()

    cleanup()
    vi.mocked(catalogApi.useTitleMetadata).mockReturnValue(
      metadataResult({
        synopsis: { value: LONG_SYNOPSIS, origin: 'provider' },
        backdropUrl: { value: 'http://img.test/duna-bd.jpg', origin: 'provider' },
        director: { value: 'Denis Villeneuve', origin: 'provider' },
      }),
    )
    renderScreen()

    expect(screen.getByText('▶ Assistir').className).toContain('tv-focus')
    const more = screen.getByRole('button', { name: /Ver mais/ })
    press('ArrowUp')
    expect(more.className).toContain('tv-focus')

    press('Enter')
    const dialog = screen.getByRole('dialog', { name: 'Sinopse completa' })
    expect(within(dialog).getByText(LONG_SYNOPSIS)).toBeInTheDocument()

    press('Escape')
    expect(screen.queryByRole('dialog', { name: 'Sinopse completa' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver mais/ }).className).toContain('tv-focus')
  })
})

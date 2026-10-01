import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen, type MovieDetailScreenProps } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import type { TitleMetadataView } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'
import { findUnnamedControls } from '../../testing/accessibleNames'

/** Feature 035 (US3) — aba Elenco com foto/personagem quando o título casou no TMDB. */
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useTitleMetadata: vi.fn(), useSimilarTitles: vi.fn() }
})
vi.mock('../../components/PlayerLayer', () => ({ PlayerLayer: () => <div role="dialog" aria-label="Reproduzindo" /> }))

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Matrix',
  original_group: 'Ação',
  published: true,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '100',
  original_name: 'Matrix',
  year: 1999,
}

const WITH_PEOPLE: TitleMetadataView = {
  tmdbMatch: 'matched',
  cast: { value: 'Texto do provedor', origin: 'provider' },
  castPeople: [
    { personId: 6384, name: 'Keanu Reeves', character: 'Neo', photoUrl: 'https://image.tmdb.org/t/p/w185/keanu.jpg' },
    { personId: 2975, name: 'Laurence Fishburne' },
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

function renderScreen(props: Partial<MovieDetailScreenProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MovieDetailScreen movieId="movie-1" onBack={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

/** ações → abas (Detalhes) → Elenco, OK. */
function openCastTab() {
  press('ArrowDown')
  press('ArrowRight')
  press('Enter')
}

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<typeof catalogApi.useCatalogItem>)
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue({ status: 'loading', titles: [] })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MovieDetailScreen — Elenco com foto (feature 035)', () => {
  it('com casamento mostra as pessoas (foto, nome, personagem só quando há) no lugar do texto do provedor', () => {
    metadata(WITH_PEOPLE)
    const { container } = renderScreen()
    openCastTab()

    expect(screen.getByText('Keanu Reeves')).toBeInTheDocument()
    expect(screen.getByText('Neo')).toBeInTheDocument()
    expect(screen.getByText('Laurence Fishburne')).toBeInTheDocument()
    expect(container.querySelectorAll('.cast-person-character')).toHaveLength(1)
    expect(container.querySelector('img.person-photo-img')).toHaveAttribute('src', expect.stringContaining('/keanu.jpg'))
    expect(screen.queryByText('Texto do provedor')).not.toBeInTheDocument()
    expect(screen.getByText('Dados: TMDB')).toBeInTheDocument()
    expect(findUnnamedControls(container)).toEqual([])
  })

  it('foto que falha vira o marcador neutro, sem <img> quebrada', () => {
    metadata(WITH_PEOPLE)
    const { container } = renderScreen()
    openCastTab()

    fireEvent.error(container.querySelector('img.person-photo-img') as HTMLImageElement)
    expect(container.querySelector('img.person-photo-img')).toBeNull()
    expect(container.querySelector('.person-photo-initials')).not.toBeNull()
  })

  it('↓ entra nas pessoas, ←/→ movem, OK abre a página de ator com aba e chave; ↑ volta às abas', () => {
    metadata(WITH_PEOPLE)
    const onOpenPerson = vi.fn()
    const { container } = renderScreen({ onOpenPerson })
    openCastTab()

    press('ArrowDown')
    expect(container.querySelectorAll('.person-photo.tv-focus')).toHaveLength(1)
    press('ArrowRight')
    press('Enter')
    expect(onOpenPerson).toHaveBeenCalledWith({ personId: 2975, name: 'Laurence Fishburne' }, { tab: 'cast', focusKey: 'person:2975' })

    press('ArrowUp')
    expect(screen.getByRole('tab', { name: 'Elenco' }).className).toContain('tv-focus')
  })

  it('restore com a pessoa: monta já com ela focada, por identidade', () => {
    metadata(WITH_PEOPLE)
    const onOpenPerson = vi.fn()
    renderScreen({ onOpenPerson, restore: { tab: 'cast', focusKey: 'person:2975' } })
    press('Enter')
    expect(onOpenPerson).toHaveBeenCalledWith({ personId: 2975, name: 'Laurence Fishburne' }, { tab: 'cast', focusKey: 'person:2975' })
  })

  it('sem castPeople continua o texto da 032, sem foco no painel', () => {
    metadata({ cast: { value: 'Keanu Reeves, Carrie-Anne Moss', origin: 'provider' } })
    const { container } = renderScreen()
    openCastTab()

    expect(screen.getByText('Keanu Reeves')).toBeInTheDocument()
    press('ArrowDown')
    expect(screen.getByRole('tab', { name: 'Elenco' }).className).toContain('tv-focus')
    expect(container.querySelector('.person-photo')).toBeNull()
  })
})

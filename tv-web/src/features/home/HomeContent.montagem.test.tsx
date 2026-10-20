import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeContent, type HomeContentProps } from './HomeContent'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, ContinueCard, FavoritesContent, HomeHeroOut, MyListContent } from '../catalog/catalogApi'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useHomeHero: vi.fn(), useContinueCards: vi.fn(), useMyListContent: vi.fn(), useFavoritesContent: vi.fn(), useRecentlyAdded: vi.fn() }
})

function item(kind: CatalogItemOut['kind'], name: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind,
    name,
    original_group: 'Grupo',
    published: true,
    playable: true,
    source_id: 'src',
    provider_stream_id: name,
    original_name: name,
    added_at: null,
    provider_rating: null,
  }
}

const ARRIVAL = item('movie', 'Arrival')
const HERO: HomeHeroOut = { kind: 'continue', item: ARRIVAL, primary: { type: 'play', itemId: ARRIVAL.id, title: 'Arrival', startAtMs: 0, resume: true } }

const reads: { hero?: HomeHeroOut; channels?: FavoritesContent; continue?: ContinueCard[]; mylist?: MyListContent; added?: CatalogItemOut[] } = {}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const query = <T,>(data: T | undefined) => ({ data, isError: false, isLoading: data === undefined })
  vi.mocked(catalogApi.useHomeHero).mockImplementation(() => query(reads.hero) as unknown as ReturnType<typeof catalogApi.useHomeHero>)
  vi.mocked(catalogApi.useFavoritesContent).mockImplementation(() => query(reads.channels) as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useContinueCards).mockImplementation(() => query(reads.continue) as unknown as ReturnType<typeof catalogApi.useContinueCards>)
  vi.mocked(catalogApi.useMyListContent).mockImplementation(() => query(reads.mylist) as unknown as ReturnType<typeof catalogApi.useMyListContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockImplementation(() => query(reads.added))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  for (const key of Object.keys(reads) as Array<keyof typeof reads>) delete reads[key]
})

function renderHome(overrides: Partial<HomeContentProps> = {}) {
  const props: HomeContentProps = {
    sourceId: 'src',
    onBack: vi.fn(),
    onExitUp: vi.fn(),
    onNavigate: vi.fn(),
    onOpenItem: vi.fn(),
    onOpenChannel: vi.fn(),
    onOpenFavorites: vi.fn(),
    onPlay: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const view = render(<HomeContent {...props} />, { wrapper })
  return { props, rerender: (next: Partial<HomeContentProps> = {}) => view.rerender(<HomeContent {...props} {...next} />) }
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const rowLabels = () => [...document.querySelectorAll('section.home-row')].map((row) => row.getAttribute('aria-label'))

describe('HomeContent — montagem (feature 079)', () => {
  it('durante a espera, ↑ leva à topbar e SELECT antes do "Carregando" não faz nada', () => {
    const { props } = renderHome()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(props.onBack).not.toHaveBeenCalled()
    expect(props.onExitUp).toHaveBeenCalledTimes(1)
  })

  it('hero que chega depois da primeira montagem atualiza o billboard na mesma visita', () => {
    reads.channels = { items: [], unresolved: 0 }
    reads.continue = []
    reads.mylist = { items: [item('movie', 'Fav')], movieCount: 1, seriesCount: 0 }
    reads.added = []
    const { rerender } = renderHome()
    advance(2000)
    expect(screen.getByText('Explore o catálogo')).toBeInTheDocument()
    expect(screen.queryByText('Bem-vindo(a) ao CCPlayTV')).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir TV ao vivo' })).toHaveClass('tv-focus')
    expect(rowLabels()).toEqual(['Minha Lista'])

    reads.hero = HERO
    rerender()
    expect(screen.getByText('Arrival')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continuar$/ })).toBeInTheDocument()
  })

  it('"Continuar" que chega acima de "Minha Lista" entra na mesma visita', () => {
    reads.hero = HERO
    reads.channels = { items: [], unresolved: 0 }
    reads.continue = []
    reads.mylist = { items: [item('movie', 'Fav')], movieCount: 1, seriesCount: 0 }
    reads.added = []
    const { rerender } = renderHome()
    expect(rowLabels()).toEqual(['Minha Lista']) // caminho do cache: hero pronto no 1º render
    advance(2000)

    reads.continue = [{ item: ARRIVAL, code: null, progress: null }]
    rerender()
    expect(rowLabels()).toEqual(['Continuar assistindo', 'Minha Lista'])
  })
})

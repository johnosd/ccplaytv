/**
 * Teste de CONTRATO da feature 079 (Home, Filmes e Séries já montadas ao entrar) — a Home espera e revela de uma vez.
 * Travado em `sdd/specs/079-home-carregamento-progressivo/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca
 * editá-lo.
 *
 * Seletores fixados: `section.home-hero` (billboard), `section.home-row[aria-label]` (fileiras), o botão "Voltar" do estado
 * de carregamento com `tv-focus`. Tecla de voltar: `Escape` (como os outros testes de tela).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeContent, type HomeContentProps } from './HomeContent'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, ContinueCard, FavoritesContent, HomeHeroOut, MyListContent } from '../catalog/catalogApi'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useHomeHero: vi.fn(),
    useContinueCards: vi.fn(),
    useMyListContent: vi.fn(),
    useFavoritesContent: vi.fn(),
    useRecentlyAdded: vi.fn(),
  }
})

const SOURCE_ID = 'source-079'

function item(kind: CatalogItemOut['kind'], name: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind,
    name,
    original_group: 'Grupo',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    added_at: null,
    provider_rating: null,
  }
}

const ARRIVAL = item('movie', 'Arrival')

/** O que cada leitura da Home devolve agora; `undefined` = ainda lendo. */
const reads: {
  hero?: HomeHeroOut
  channels?: FavoritesContent
  continue?: ContinueCard[]
  mylist?: MyListContent
  addedMovies?: CatalogItemOut[]
  addedSeries?: CatalogItemOut[]
} = {}

function mockReads() {
  vi.mocked(catalogApi.useHomeHero).mockImplementation(
    () => ({ data: reads.hero, isError: false, isLoading: reads.hero === undefined }) as unknown as ReturnType<typeof catalogApi.useHomeHero>,
  )
  vi.mocked(catalogApi.useFavoritesContent).mockImplementation(
    () => ({ data: reads.channels, isError: false, isLoading: reads.channels === undefined }) as unknown as ReturnType<typeof catalogApi.useFavoritesContent>,
  )
  vi.mocked(catalogApi.useContinueCards).mockImplementation(
    () => ({ data: reads.continue, isError: false, isLoading: reads.continue === undefined }) as unknown as ReturnType<typeof catalogApi.useContinueCards>,
  )
  vi.mocked(catalogApi.useMyListContent).mockImplementation(
    () => ({ data: reads.mylist, isError: false, isLoading: reads.mylist === undefined }) as unknown as ReturnType<typeof catalogApi.useMyListContent>,
  )
  vi.mocked(catalogApi.useRecentlyAdded).mockImplementation((_sourceId, kind) => {
    const data = kind === 'movie' ? reads.addedMovies : reads.addedSeries
    return { data, isLoading: data === undefined }
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  for (const key of Object.keys(reads) as Array<keyof typeof reads>) delete reads[key]
})

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const rowLabels = () => [...document.querySelectorAll('section.home-row')].map((row) => row.getAttribute('aria-label'))

describe('HomeContent — contrato da feature 079', () => {
  // US1/AC1, US1/AC2, US1/AC4, US2/AC1, US2/AC3, FR-001, FR-004, FR-005, FR-011, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('nada da Home é desenhado enquanto as leituras chegam fora de ordem; "Carregando" com Voltar focado; com tudo pronto, billboard e fileiras aparecem juntos e na ordem', async () => {
    mockReads()
    const props: HomeContentProps = {
      sourceId: SOURCE_ID,
      onBack: vi.fn(),
      onNavigate: vi.fn(),
      onOpenItem: vi.fn(),
      onOpenChannel: vi.fn(),
      onOpenFavorites: vi.fn(),
      onPlay: vi.fn(),
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    const { rerender } = render(<HomeContent {...props} />, { wrapper: Wrapper })

    // Nada lido ainda: nem billboard (nem o de boas-vindas), nem fileira.
    expect(document.querySelector('section.home-hero')).toBeNull()
    expect(rowLabels()).toEqual([])
    expect(screen.queryByText('Bem-vindo(a) ao CCPlayTV')).toBeNull()

    // Passados 300 ms: "Carregando" com Voltar focado; RETURN volta sem esperar nada.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus'))
    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)

    // As de baixo terminam primeiro: aparecem na ordem da tela assim que a janela curta passou.
    reads.addedSeries = [item('series', 'Série Nova')]
    reads.addedMovies = [item('movie', 'Filme Novo')]
    reads.mylist = { items: [item('movie', 'Favorito')], movieCount: 1, seriesCount: 0 }
    rerender(<HomeContent {...props} />)
    expect(rowLabels()).toEqual(['Minha Lista', 'Filmes adicionados', 'Séries adicionadas'])

    // As de cima terminam: entram na mesma visita, na ordem aprovada, com o billboard resolvido.
    reads.continue = [{ item: ARRIVAL, code: null, progress: null }]
    reads.channels = { items: [item('channel', 'Canal Um')], unresolved: 0 }
    reads.hero = { kind: 'continue', item: ARRIVAL, primary: { type: 'play', itemId: ARRIVAL.id, title: 'Arrival', startAtMs: 600_000, resume: true } }
    rerender(<HomeContent {...props} />)
    await waitFor(() => expect(rowLabels()).toEqual(['Canais favoritos', 'Continuar assistindo', 'Minha Lista', 'Filmes adicionados', 'Séries adicionadas']))
    expect(document.querySelector('section.home-hero')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^(▶\s*)?Continuar$/ })).toHaveClass('tv-focus')
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
  })
})

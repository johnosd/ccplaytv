import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import type { TitleMetadataView } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'

// Feature 059 (detalhe Cinema), US1 — testes de apoio, fora do contrato travado.

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useTitleMetadata: vi.fn(), useSimilarTitles: vi.fn(), useTmdbStatus: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(({ title }: { title: string }) => <div role="dialog" aria-label={`Reproduzindo ${title}`} />),
}))

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Duna',
  original_group: 'Lançamentos 2024',
  published: true,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '100',
  original_name: 'Duna',
  year: 2021,
  icon_url: 'http://img.test/capa.jpg',
}

function metadata(data: TitleMetadataView) {
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data, isLoading: false, isFetching: false } as unknown as ReturnType<
    typeof catalogApi.useTitleMetadata
  >)
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

const focused = (text: string) => screen.getByText(text).className.includes('tv-focus')

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<typeof catalogApi.useCatalogItem>)
  vi.mocked(catalogApi.useTmdbStatus).mockReturnValue({ data: { state: 'connected' } } as unknown as ReturnType<
    typeof catalogApi.useTmdbStatus
  >)
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue({ status: 'loading', titles: [] })
  metadata({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MovieDetailScreen — hero Cinema (feature 059)', () => {
  it('sem backdrop o fundo de ambiente existe, e nada de estilo vai para a raiz .screen (FR-002, FR-025)', () => {
    renderScreen()
    const root = document.querySelector('.screen.vod-detail')
    expect(root?.querySelector('.vod-detail-hero .vod-detail-ambient')).not.toBeNull()
    expect(root?.querySelector('.vod-detail-backdrop')).toBeNull()
    expect(root?.getAttribute('style')).toBeNull()
  })

  it('backdrop que falha some sozinho; o ambiente e a capa continuam (edge case "capa/imagem quebrada")', () => {
    metadata({ backdropUrl: { value: 'http://img.test/quebrado.jpg', origin: 'tmdb' } })
    renderScreen()
    const backdrop = document.querySelector<HTMLImageElement>('.vod-detail-backdrop img')
    expect(backdrop).not.toBeNull()
    fireEvent.error(backdrop as HTMLImageElement)
    expect(document.querySelector('.vod-detail-backdrop')).toBeNull()
    expect(document.querySelector('.vod-detail-ambient')).not.toBeNull()
    expect(document.querySelector('.vod-detail-poster .poster-box')).not.toBeNull()
  })

  it('a categoria não aparece mais na linha de metadata; a duração da metadata aparece lá (D-006)', () => {
    metadata({ durationSeconds: { value: 9300, origin: 'tmdb' } })
    renderScreen()
    const meta = document.querySelector('.vod-detail-meta')
    expect(meta?.textContent).toContain('2021')
    expect(meta?.textContent).toContain('2 h 35 min')
    expect(meta?.textContent).not.toContain('Lançamentos 2024')
  })

  it('marcar como assistido mostra o selo na capa e na metadata; desmarcar tira os dois', async () => {
    renderScreen()
    for (let i = 0; i < 4; i++) press('ArrowRight') // Assistir → Minha Lista → Trailer → Semelhantes → Marcar
    expect(focused('✓ Marcar como assistido')).toBe(true)
    press('Enter')
    expect(await screen.findByText('✗ Desmarcar assistido')).toBeInTheDocument()
    expect(document.querySelector('.vod-detail-meta-watched')?.textContent).toBe('✓ Assistido')
    expect(document.querySelector('.vod-detail-poster .vod-detail-watched-badge')).not.toBeNull()

    press('Enter')
    expect(await screen.findByText('✓ Marcar como assistido')).toBeInTheDocument()
    expect(document.querySelector('.vod-detail-meta-watched')).toBeNull()
    expect(document.querySelector('.vod-detail-watched-badge')).toBeNull()
  })

  it('cartões de Detalhes trazem a origem de cada fato; no hero o dado da fonte continua sem selo (D-006, FR-012)', () => {
    metadata({
      genres: { value: 'Ficção', origin: 'provider' },
      director: { value: 'Denis Villeneuve', origin: 'tmdb' },
    })
    renderScreen()
    const card = (label: string) => screen.getByText(label).closest('.vod-detail-fact') as HTMLElement
    expect(card('Direção').textContent).toContain('Dados: TMDB')
    expect(card('Gênero').textContent).toContain('Dados: fonte')
    expect(card('Categoria').textContent).toContain('Dados: fonte')
    expect(card('Ano').textContent).toContain('Dados: fonte')
    expect(card('Tipo').textContent).not.toContain('Dados:')
    // Hero: gênero da fonte não ganha selo (regra da 032).
    expect(document.querySelector('.vod-detail-hero')?.textContent).not.toContain('Dados: fonte')
  })

  it('↑ das abas volta à última ação focada (não à primária) e devolve a página ao topo (FR-017)', () => {
    renderScreen()
    press('ArrowRight') // Minha Lista
    press('ArrowDown') // aba ativa
    expect(screen.getByRole('tab', { name: 'Detalhes' }).className).toContain('tv-focus')
    const root = document.querySelector<HTMLElement>('.screen.vod-detail') as HTMLElement
    root.scrollTop = 400
    press('ArrowUp')
    expect(focused('+ Minha Lista')).toBe(true)
    expect(root.scrollTop).toBe(0)
  })
})

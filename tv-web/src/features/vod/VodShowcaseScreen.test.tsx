/**
 * Vitrine de Filmes/Séries (feature 052) — casos além do contrato travado
 * (`VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx`): hero por tipo de foco, rótulos por fileira e por
 * seção, estados (carregando, erro, sem filmes) e item que sai do histórico enquanto em foco.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodShowcaseScreen } from './VodShowcaseScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory, type VodSection } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'

const restore: Array<() => void> = []
function define(target: object, key: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
  restore.push(() => {
    if (previous) Object.defineProperty(target, key, previous)
    else delete (target as Record<string, unknown>)[key]
  })
}

beforeAll(() => {
  define(HTMLElement.prototype, 'offsetHeight', 640)
  define(HTMLElement.prototype, 'offsetWidth', 1200)
  define(Element.prototype, 'clientHeight', 640)
  define(Element.prototype, 'clientWidth', 1200)
  class FakeResizeObserver {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      this.callback([{ contentRect: { width: 1200, height: 640 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  }
  define(globalThis, 'ResizeObserver', FakeResizeObserver)
})

afterAll(() => {
  for (const undo of restore.reverse()) undo()
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useHistoryContent: vi.fn(),
    useFavoritesContent: vi.fn(),
    useRecentlyAdded: vi.fn(),
  }
})

const SOURCE_ID = 'source-showcase'

function item(name: string, kind: 'movie' | 'series' = 'movie', extra: Partial<CatalogItemOut> = {}): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind,
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    ...extra,
  }
}

function category(id: number, name: string): CatalogCategory {
  return { id, kind: 'movie', name, order: id, count: 5, fetchMode: 'eager', providerCategoryId: String(id) }
}

interface Data {
  categories?: CatalogCategory[]
  categoriesState?: { isLoading?: boolean; isError?: boolean }
  history?: CatalogItemOut[]
  favorites?: CatalogItemOut[]
  added?: CatalogItemOut[]
}

function mockData(data: Data) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: data.categoriesState ? undefined : (data.categories ?? [category(1, 'Filmes | Ação')]),
    isLoading: data.categoriesState?.isLoading ?? false,
    isError: data.categoriesState?.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useHistoryContent).mockReturnValue({
    data: { items: data.history ?? [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: data.favorites ?? [], unresolved: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useRecentlyAdded).mockReturnValue({ data: data.added ?? [], isLoading: false })
}

function renderShowcase(section: VodSection = 'movies', props: { onBack?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onBack = props.onBack ?? vi.fn()
  const onOpenTarget = vi.fn()
  const ui = (): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <VodShowcaseScreen
        section={section}
        sourceId={SOURCE_ID}
        onOpenItem={vi.fn()}
        onOpenTarget={onOpenTarget}
        onBack={onBack}
        onResync={vi.fn()}
      />
    </QueryClientProvider>
  )
  const result = render(ui())
  return { ...result, onBack, onOpenTarget, rerenderShowcase: () => result.rerender(ui() as never) }
}

function tap(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
  }
}

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null

beforeEach(async () => {
  resetVodSessionMemory()
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte de teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('VodShowcaseScreen — hero', () => {
  it('rótulo por fileira: ↺ VISTOS RECENTEMENTE, ★ SEUS FAVORITOS e o da seção; metadados reais do item', () => {
    mockData({
      history: [item('Visto', 'movie', { year: 2020 })],
      favorites: [item('Favorito')],
      added: [item('Novo')],
    })
    renderShowcase()
    expect(text('.vod-hero-eyebrow')).toBe('↺ VISTOS RECENTEMENTE')
    expect(text('.vod-hero-meta')).toContain('2020')
    tap('ArrowDown', 2) // Top 10 (reservado) → ★ Favoritos; no slot o hero mantém o último item
    expect(text('.vod-hero-eyebrow')).toBe('★ SEUS FAVORITOS')
    expect(text('.vod-hero-title')).toBe('Favorito')
    tap('ArrowDown')
    expect(text('.vod-hero-eyebrow')).toBe('CCPLAY CINEMA')
    expect(text('.vod-hero-title')).toBe('Novo')
  })

  it('na fileira de Categorias mostra o nome (sem o prefixo "Filmes |") e a contagem, sem capa', () => {
    mockData({ categories: [category(1, 'Filmes | Ação')] })
    renderShowcase()
    expect(text('.vod-hero-eyebrow')).toBe('CATEGORIA')
    expect(text('.vod-hero-title')).toBe('★ Favoritos')
    tap('ArrowDown', 3) // lista lateral: ★, ↺, Todos → "Ação"
    expect(text('.vod-hero-title')).toBe('Ação')
    expect(text('.vod-hero-meta')).toContain('5')
    expect(document.querySelector('.vod-hero-art img')).toBeNull()
  })

  it('em "Ver tudo" a hero mantém o último item da fileira (nunca um placeholder rotulado)', () => {
    mockData({ favorites: [item('F1'), item('F2')] })
    renderShowcase()
    tap('ArrowRight', 2) // F1 → F2 → "Ver tudo"
    expect(text('.vod-hero-title')).toBe('F2')
  })

  it('Séries: rótulo CCPLAY SÉRIES e "Em dia"/"n/m" só com dado real', () => {
    mockData({ added: [item('Série X', 'series', { series_id: 's1' })] })
    renderShowcase('series')
    expect(text('.vod-hero-eyebrow')).toBe('CCPLAY SÉRIES')
    expect(text('.vod-hero-title')).toBe('Série X')
  })
})

describe('VodShowcaseScreen — nota do provedor (feature 055)', () => {
  // FR-006, FR-003, US1/AC2+AC3
  it('hero mostra "★ 7,4 Provedor" para item com nota; sem nota, 0 ou null não aparece nada de nota', () => {
    mockData({ favorites: [item('Com nota', 'movie', { provider_rating: 7.4 })], added: [item('Sem nota', 'movie', { provider_rating: 0 })] })
    renderShowcase()
    // Sem histórico, a primeira fileira é ★ Favoritos e o foco já começa nela.
    expect(text('.vod-hero-title')).toBe('Com nota')
    expect(text('.vod-hero-meta')).toContain('★ 7,4')
    expect(text('.vod-hero-meta')).toContain('Provedor')
    tap('ArrowDown', 2) // Top 10 (reservado) → Adicionados recentemente
    expect(text('.vod-hero-title')).toBe('Sem nota')
    expect(document.querySelector('.vod-hero-meta .rating-badge')).toBeNull()
    expect(text('.vod-hero-meta')).not.toMatch(/★|Provedor|sem nota/i)
  })

  // FR-005
  it('card da fileira mostra o selo "★ 8,0" só com nota válida, sem o rótulo de origem', () => {
    mockData({ favorites: [item('Com nota', 'movie', { provider_rating: 8 }), item('Sem nota')] })
    renderShowcase()
    const badges = [...document.querySelectorAll('.vod-row .rating-badge')].map((el) => el.textContent)
    expect(badges).toEqual(['★ 8,0'])
  })
})

describe('VodShowcaseScreen — gênero e fundo da listagem das séries (feature 055)', () => {
  // FR-007, US2/AC1+AC2
  it('hero de série mostra o gênero como subtítulo e o fundo da listagem; sem eles, igual a antes', () => {
    mockData({
      added: [
        item('Com tudo', 'series', {
          series_id: 's1',
          icon_url: 'http://exemplo.test/capa.jpg',
          provider_genres: 'Comédia, Drama',
          provider_backdrop_url: 'http://exemplo.test/fundo.jpg',
        }),
        item('Sem nada', 'series', { series_id: 's2', icon_url: 'http://exemplo.test/capa2.jpg' }),
      ],
    })
    renderShowcase('series')
    expect(text('.vod-hero-title')).toBe('Com tudo')
    expect(text('.vod-hero-meta')).toContain('Comédia, Drama')
    expect(document.querySelector('.vod-hero-art img')).toHaveAttribute('src', 'http://exemplo.test/fundo.jpg')

    tap('ArrowRight') // próximo card da fileira
    expect(text('.vod-hero-title')).toBe('Sem nada')
    expect(text('.vod-hero-meta')).not.toContain('Comédia')
    // Sem fundo da listagem, a capa continua sendo a arte do destaque (como antes).
    expect(document.querySelector('.vod-hero-art img')).toHaveAttribute('src', 'http://exemplo.test/capa2.jpg')
  })

  // D-003/D-010: filme não usa gênero nem fundo da listagem (campos só existem em série; mesmo se vierem, são ignorados)
  it('hero de filme continua com a capa e sem gênero da listagem', () => {
    mockData({
      added: [
        item('Filme', 'movie', {
          icon_url: 'http://exemplo.test/capa.jpg',
          provider_genres: 'Gênero da listagem',
          provider_backdrop_url: 'http://exemplo.test/fundo.jpg',
        }),
      ],
    })
    renderShowcase('movies')
    expect(text('.vod-hero-meta')).not.toContain('Gênero da listagem')
    expect(document.querySelector('.vod-hero-art img')).toHaveAttribute('src', 'http://exemplo.test/capa.jpg')
  })

  // FR-013, SC-002: focar nunca consulta nada — o hero só lê o que o item já carrega
  it('mover o foco entre cards não dispara nenhuma requisição', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    mockData({
      added: [
        item('A', 'series', { series_id: 's1', provider_genres: 'Drama' }),
        item('B', 'series', { series_id: 's2', provider_genres: 'Comédia' }),
      ],
    })
    renderShowcase('series')
    tap('ArrowRight')
    tap('ArrowLeft')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('VodShowcaseScreen — fileiras e estados', () => {
  it('uma fileira some quando o último item sai (o foco cai na anterior existente, nunca some)', () => {
    mockData({ history: [item('H1')], favorites: [item('F1')] })
    const view = renderShowcase()
    tap('ArrowDown', 2) // Top 10 (reservado) → ★ Favoritos
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('section')?.getAttribute('aria-label')).toBe('★ Favoritos')

    mockData({ history: [item('H1')], favorites: [] }) // o favorito foi removido
    view.rerenderShowcase()
    expect(document.querySelector('section[aria-label="★ Favoritos"]')).toBeNull()
    expect(document.querySelectorAll('.vod-showcase .tv-focus')).toHaveLength(1)
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('section')?.getAttribute('aria-label')).toBe('Continue assistindo')
  })

  it('categorias carregando, com erro e sem nenhuma categoria: estado próprio com ação focável', () => {
    mockData({ categoriesState: { isLoading: true } })
    const loading = renderShowcase()
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
    tap('Enter')
    expect(loading.onBack).toHaveBeenCalledTimes(1)
    loading.unmount()

    mockData({ categoriesState: { isError: true } })
    const failed = renderShowcase()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    failed.unmount()

    mockData({ categories: [] })
    renderShowcase()
    expect(screen.getByText('Nenhum filme nesta lista')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
  })

  it('RETURN volta ao destino anterior e a vitrine nunca marca foco em mais de um cartão', () => {
    mockData({ history: [item('H1'), item('H2')], favorites: [item('F1')] })
    const { onBack } = renderShowcase()
    tap('ArrowRight')
    tap('ArrowDown')
    tap('ArrowRight')
    expect(document.querySelectorAll('.vod-showcase .tv-focus')).toHaveLength(1)
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})



/**
 * Vitrine de Filmes/Séries (feature 052) — casos além do contrato travado
 * (`VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx`): vitrine sem hero, estados (carregando, erro, sem filmes) e item que sai do histórico enquanto em foco.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// Feature 079: as fileiras prontas aparecem após a janela curta e as tardias entram na posição canônica.
describe('VodShowcaseScreen — fileiras progressivas ao abrir', () => {
  it('sem o histórico ainda: mostra as fileiras prontas e insere Continue quando ele chega', async () => {
    mockData({ added: [item('A'), item('B')] })
    vi.mocked(catalogApi.useHistoryContent).mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof catalogApi.useHistoryContent>)
    // Tempo controlado: com relógio real, sob a carga da suíte inteira o teto de 2 s chegava antes do Enter (feature 079).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { rerenderShowcase } = renderShowcase('movies')

    // Feature 079 (FR-004): o "Carregando" só aparece depois de 300 ms — antes, nada pisca.
    expect(screen.queryByText('Carregando filmes…')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByText('Carregando filmes…')).not.toBeInTheDocument()
    expect(document.querySelectorAll('section.vod-row').length).toBeGreaterThan(0)

    mockData({ history: [item('H')], added: [item('A'), item('B')] })
    rerenderShowcase()
    // As leituras do TMDB/"Bem avaliados" deste arquivo são reais e continuam podendo chegar depois.
    act(() => {
      vi.advanceTimersByTime(1700)
    })
    vi.useRealTimers()
    expect(document.querySelectorAll('section.vod-row').length).toBeGreaterThan(0)
    const labels = [...document.querySelectorAll('section.vod-row')].map((row) => row.getAttribute('aria-label'))
    expect(labels[0]).toBe('Continue assistindo')
    expect(labels).toContain('Adicionados recentemente')
    expect(text('.content-card:has(.tv-focus)')).toContain('H')
  })

  it('com as leituras locais já em mãos (reabrir a tela), desenha na hora, sem passar pelo "Carregando"', () => {
    mockData({ history: [item('H')], added: [item('A')] })
    renderShowcase('movies')
    expect(screen.queryByText('Carregando filmes…')).not.toBeInTheDocument()
    expect(document.querySelector('section.vod-row')?.getAttribute('aria-label')).toBe('Continue assistindo')
  })
})

describe('VodShowcaseScreen — vitrine sem hero', () => {
  it.each(['movies', 'series'] as const)('%s: mantém os cards e o foco sem faixa de hero', (section) => {
    mockData({ added: [item('A', section === 'movies' ? 'movie' : 'series'), item('B', section === 'movies' ? 'movie' : 'series')] })
    renderShowcase(section)
    expect(document.querySelector('.vod-hero-band')).toBeNull()
    expect(document.querySelector('.vod-showcase-main')?.firstElementChild).toHaveClass('vod-showcase-rows')
    expect(text('.content-card:has(.tv-focus)')).toContain('A')
    tap('ArrowRight')
    expect(text('.content-card:has(.tv-focus)')).toContain('B')
    expect(document.querySelectorAll('.vod-showcase .tv-focus')).toHaveLength(1)
  })
})

describe('VodShowcaseScreen — nota do provedor (feature 055)', () => {
  // FR-005
  it('card da fileira mostra o selo "★ 8,0" só com nota válida, sem o rótulo de origem', () => {
    mockData({ favorites: [item('Com nota', 'movie', { provider_rating: 8 }), item('Sem nota')] })
    renderShowcase()
    const badges = [...document.querySelectorAll('.vod-row .rating-badge')].map((el) => el.textContent)
    expect(badges).toEqual(['★ 8,0'])
  })
})

describe('VodShowcaseScreen — navegação sem consultas externas', () => {
  // FR-013, SC-002: focar nunca consulta nada
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
    tap('ArrowDown') // → ★ Favoritos
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('section')?.getAttribute('aria-label')).toBe('★ Favoritos')

    mockData({ history: [item('H1')], favorites: [] }) // o favorito foi removido
    view.rerenderShowcase()
    expect(document.querySelector('section[aria-label="★ Favoritos"]')).toBeNull()
    expect(document.querySelectorAll('.vod-showcase .tv-focus')).toHaveLength(1)
    expect(document.querySelector('.vod-showcase .tv-focus')?.closest('section')?.getAttribute('aria-label')).toBe('Continue assistindo')
  })

  it('categorias carregando, com erro e sem nenhuma categoria: estado próprio com ação focável', async () => {
    mockData({ categoriesState: { isLoading: true } })
    const loading = renderShowcase()
    // Feature 079 (FR-004): o "Carregando" com Voltar aparece passados 300 ms.
    // Atraso em tempo real: na suíte completa (jsdom sob carga) o 1 s padrão do waitFor estourou.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus'), { timeout: 5000 })
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



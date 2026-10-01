/**
 * Cobertura complementar da feature 036 na grade (fora do contrato travado):
 * tecla vermelha fora do Histórico, último item → estado vazio focável,
 * "apagar progresso" tira de Continuar, série inteira, dica ausente sem a
 * tecla registrada. Mesmo ambiente de layout do contrato.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCatalogScreen } from './VodCatalogScreen'
import * as catalogApi from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'
import { buildStableId, getContinueWatching, updateProgress } from '../../lib/catalog/userStateRepository'

const restorers: Array<() => void> = []

beforeAll(() => {
  function stub(target: object, key: string, descriptor: PropertyDescriptor) {
    const previous = Object.getOwnPropertyDescriptor(target, key)
    Object.defineProperty(target, key, { configurable: true, ...descriptor })
    restorers.push(() => {
      if (previous) Object.defineProperty(target, key, previous)
    })
  }
  stub(HTMLElement.prototype, 'offsetHeight', { value: 640 })
  stub(HTMLElement.prototype, 'offsetWidth', { value: 1200 })
  stub(Element.prototype, 'clientHeight', { value: 640 })
  stub(Element.prototype, 'scrollHeight', { value: 1_000_000 })
  stub(HTMLElement.prototype, 'scrollTo', {
    writable: true,
    value: function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
      const top = typeof options === 'object' && options !== null ? options.top : undefined
      if (typeof top === 'number') this.scrollTop = top
      queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
    },
  })
  const previousResizeObserver = globalThis.ResizeObserver
  class FakeResizeObserver {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      this.callback([{ contentRect: { width: 1200 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
  restorers.push(() => {
    globalThis.ResizeObserver = previousResizeObserver
  })
})

afterAll(() => {
  for (const restore of restorers.reverse()) restore()
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-limpar-historico-extra'

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function gridTitles(): string[] {
  return [...document.querySelectorAll('.vod-grid .content-card-title')].map((el) => el.textContent ?? '')
}

function renderScreen(section: 'movies' | 'series') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <VodCatalogScreen section={section} sourceId={SOURCE_ID} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
    </Wrapper>,
  )
}

function enterHistory() {
  press('ArrowUp') // "Todos"
  press('ArrowUp') // "↺ Histórico"
  press('ArrowRight')
}

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
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 1, fetchMode: 'on_demand', providerCategoryId: '1' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: {
      items: [{ id: '900', name: 'Filme Categoria', kind: 'movie', source_id: SOURCE_ID, provider_stream_id: 'c', original_name: 'Filme Categoria' }],
      totalCount: 1,
      outcome: 'fresh',
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 0, isLoading: false })
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('VodCatalogScreen — remover do Histórico (feature 036, complementar)', () => {
  it('tecla vermelha numa categoria comum não faz nada', async () => {
    renderScreen('movies')
    press('ArrowRight') // entra em "Ação"
    await waitFor(() => expect(gridTitles()).toEqual(['Filme Categoria']))

    press('ColorF0Red')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('último item com "Remover e apagar progresso": estado vazio focável e nada em Continuar; sem tecla registrada, sem dica', async () => {
    await db.channels.add({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: 'Único', originalName: 'Único', groupOrder: 0, providerStreamId: 'u' })
    await updateProgress(`${SOURCE_ID}|movie|id:u`, SOURCE_ID, 50)

    renderScreen('movies')
    enterHistory()
    await waitFor(() => expect(gridTitles()).toEqual(['Único']))
    expect(screen.queryByText('● Remover do histórico')).not.toBeInTheDocument()

    press('ColorF0Red')
    const dialog = await screen.findByRole('dialog', { name: /histórico/i })
    // SC-004: com a confirmação aberta, só o botão do modal marca foco — o card de trás não.
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
    press('ArrowRight')
    press('ArrowRight')
    expect(within(dialog).getByRole('button', { name: 'Remover e apagar progresso' })).toHaveClass('tv-focus')
    press('Enter')

    await waitFor(() => expect(screen.getByText('Seu histórico está vazio')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
    expect(await getContinueWatching(SOURCE_ID, db)).toEqual([])
  })

  it('voltando do detalhe com o card de origem removido, o foco fica no vizinho pela focusedIndexHint (T021, US1/AC9)', async () => {
    for (const [name, id] of [['Primeiro', 'p1'], ['Segundo', 'p2'], ['Terceiro', 'p3']] as const) {
      await db.channels.add({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name, originalName: name, groupOrder: 0, providerStreamId: id })
    }
    // Ordem do Histórico: mais recente primeiro → Terceiro, Segundo, Primeiro.
    for (const id of ['p1', 'p2', 'p3']) {
      await updateProgress(`${SOURCE_ID}|movie|id:${id}`, SOURCE_ID, 10)
      await new Promise((resolve) => setTimeout(resolve, 2))
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <VodCatalogScreen
          section="movies"
          sourceId={SOURCE_ID}
          onOpenItem={vi.fn()}
          onBack={vi.fn()}
          onResync={vi.fn()}
          restore={{
            trailKey: { kind: 'history' },
            entered: { kind: 'history' },
            col: 1,
            focusedItemId: 'id-que-nao-existe-mais',
            searchTerm: '',
            searchActive: false,
            focusedIndexHint: 1,
          }}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(gridTitles()).toEqual(['Terceiro', 'Segundo', 'Primeiro']))
    const focused = [...document.querySelectorAll('.vod-grid-cell')].find((c) => c.querySelector('.tv-focus'))
    expect(focused?.querySelector('.content-card-title')?.textContent).toBe('Segundo')
  })

  it('série: some da grade com todos os episódios, sem tocar outra série', async () => {
    await db.channels.bulkAdd([
      { sourceId: SOURCE_ID, generation: 1, kind: 'series', name: 'Série Um', originalName: 'Série Um', groupOrder: 0, seriesId: 's1' },
      { sourceId: SOURCE_ID, generation: 1, kind: 'series', name: 'Série Dois', originalName: 'Série Dois', groupOrder: 0, seriesId: 's2' },
      { sourceId: SOURCE_ID, generation: 1, kind: 'episode', name: 'E1', originalName: 'E1', groupOrder: 0, seriesId: 's1', providerStreamId: 'e1', seasonNumber: 1, episodeNumber: 1 },
      { sourceId: SOURCE_ID, generation: 1, kind: 'episode', name: 'E2', originalName: 'E2', groupOrder: 0, seriesId: 's1', providerStreamId: 'e2', seasonNumber: 2, episodeNumber: 1 },
      { sourceId: SOURCE_ID, generation: 1, kind: 'episode', name: 'X1', originalName: 'X1', groupOrder: 0, seriesId: 's2', providerStreamId: 'x1', seasonNumber: 1, episodeNumber: 1 },
    ])
    const ep = (id: string, season: number) =>
      buildStableId({ sourceId: SOURCE_ID, kind: 'episode', providerStreamId: id, seasonNumber: season, episodeNumber: 1 })
    await updateProgress(ep('x1', 1), SOURCE_ID, 10)
    await new Promise((resolve) => setTimeout(resolve, 2))
    await updateProgress(ep('e1', 1), SOURCE_ID, 10)
    await new Promise((resolve) => setTimeout(resolve, 2))
    await updateProgress(ep('e2', 2), SOURCE_ID, 10)

    renderScreen('series')
    enterHistory()
    await waitFor(() => expect(gridTitles()).toEqual(['Série Um', 'Série Dois']))

    press('ColorF0Red')
    await screen.findByRole('dialog', { name: /histórico/i })
    press('ArrowRight')
    press('Enter')

    await waitFor(() => expect(gridTitles()).toEqual(['Série Dois']))
  })
})

/**
 * Teste de CONTRATO da feature 036 (Limpar histórico e remover item do
 * Histórico) — remoção pela tecla vermelha na grade do "↺ Histórico".
 * Travado em `sdd/specs/036-limpar-historico/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `sdd/specs/036-limpar-historico/logic/remocao-historico.md` §4–§6.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCatalogScreen } from './VodCatalogScreen'
import * as catalogApi from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import { db } from '../../lib/catalog/db'
import { getUserState, updateProgress } from '../../lib/catalog/userStateRepository'

// Mesmo ambiente de layout de `VodCatalogScreen.test.tsx`: sem isto a grade
// virtualizada não renderiza nenhuma célula no jsdom.
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
    // Histórico/retomada/favoritos: reais, contra fake-indexeddb.
  }
})

const SOURCE_ID = 'source-limpar-historico'

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function gridTitles(): string[] {
  return [...document.querySelectorAll('.vod-grid .content-card-title')].map((el) => el.textContent ?? '')
}

function focusedGridTitle(): string | undefined {
  const cell = [...document.querySelectorAll('.vod-grid-cell')].find((c) => c.querySelector('.tv-focus'))
  return cell?.querySelector('.content-card-title')?.textContent ?? undefined
}

async function seedMovie(name: string, streamId: string): Promise<void> {
  await db.channels.add({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    name,
    originalName: name,
    groupOrder: 0,
    providerStreamId: streamId,
  })
}

describe('VodCatalogScreen — remover do "↺ Histórico" (contrato da feature 036)', () => {
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
      data: [{ id: 1, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: [], totalCount: 0, outcome: 'fresh' },
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

  // FR-001, FR-007, FR-008, FR-011, FR-017, US1/AC1, US1/AC7, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('tecla vermelha no item focado abre a confirmação com "Cancelar" focado; "Remover do histórico" tira o item, foca o vizinho e mantém a retomada', async () => {
    await seedMovie('Filme A', 'a')
    await seedMovie('Filme B', 'b')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100)
    await new Promise((resolve) => setTimeout(resolve, 2))
    await updateProgress(`${SOURCE_ID}|movie|id:b`, SOURCE_ID, 200) // mais recente: 1º da grade, focado ao entrar

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    render(
      <Wrapper>
        <VodCatalogScreen section="movies" sourceId={SOURCE_ID} onOpenItem={vi.fn()} onBack={vi.fn()} onResync={vi.fn()} />
      </Wrapper>,
    )

    press('ArrowUp') // "Todos"
    press('ArrowUp') // "↺ Histórico"
    press('ArrowRight') // entra
    await waitFor(() => expect(gridTitles()).toEqual(['Filme B', 'Filme A']))
    expect(focusedGridTitle()).toBe('Filme B')

    press('ColorF0Red')

    const dialog = await screen.findByRole('dialog', { name: /histórico/i })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    // Filme B tem retomada: as três ações existem (FR-007).
    expect(within(dialog).getByRole('button', { name: 'Remover do histórico' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remover e apagar progresso' })).toBeInTheDocument()

    press('ArrowRight') // Cancelar -> Remover do histórico
    expect(within(dialog).getByRole('button', { name: 'Remover do histórico' })).toHaveClass('tv-focus')
    press('Enter')

    await waitFor(() => expect(gridTitles()).toEqual(['Filme A']))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(focusedGridTitle()).toBe('Filme A')
    expect(await getUserState(`${SOURCE_ID}|movie|id:b`, db)).toMatchObject({ progressSeconds: 200 })
  })
})

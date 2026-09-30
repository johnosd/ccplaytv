/**
 * Testes de CONTRATO da feature 024 (Live TV no DS V14) — travados em
 * `sdd/specs/024-live-tv-ds-v14/contract-tests.lock`. O sdd-execute só pode
 * fazê-los passar, nunca editá-los.
 *
 * Seletores fixados por este contrato (fonte de verdade — o plan.md não
 * repete isto em prosa):
 * - `.side-category-nav-item`: cada entrada da coluna de categorias
 *   (`SideCategoryNav`, feature 022), incluindo "★ Favoritos" e "Todos".
 * - `.topbar-item`: destinos da topbar (feature 023); o destino atual tem
 *   `aria-current="page"`.
 * - `.live-preview-panel`: o painel de preview; suas ações são `<button>`s
 *   identificados pelo texto ("Assistir", "Favoritar"/"Favorito", "Guia completo").
 * - `.live-item-name`: nome do canal na linha (já fixado pelo contrato da 018).
 * - `.tv-focus`: foco de estado (ADR-009).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen, type LiveShellProps } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'

// Mesmos mocks de layout de LiveScreen.test.tsx: jsdom não faz layout, e o
// painel de canais é virtualizado (feature 009).
let restoreOffsetHeight: PropertyDescriptor | undefined
let restoreOffsetWidth: PropertyDescriptor | undefined
let restoreClientHeight: PropertyDescriptor | undefined
let restoreScrollHeight: PropertyDescriptor | undefined
let restoreScrollTo: PropertyDescriptor | undefined

beforeAll(() => {
  restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  restoreClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  restoreScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  restoreScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 400 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
      const top = typeof options === 'object' && options !== null ? options.top : undefined
      if (typeof top === 'number') this.scrollTop = top
      queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
    },
  })
})

afterAll(() => {
  if (restoreOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  if (restoreClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', restoreClientHeight)
  if (restoreScrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', restoreScrollHeight)
  if (restoreScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', restoreScrollTo)
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    fetchPlayback: vi.fn(),
    useAggregatedItems: vi.fn(),
    // useFavoriteIds / useToggleFavorite: reais, contra `db` (fake-indexeddb).
  }
})

const SOURCE_ID = 'source-1'

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'channel', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function channel(name: string, streamId: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'channel',
    name,
    original_group: 'Esportes',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: streamId,
    original_name: name,
  }
}

function mockCatalog() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category(1, 'Esportes', 0), category(2, 'Notícias', 1)],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat?.id === 1 ? [channel('Canal A', 'a'), channel('Canal B', 'b')] : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items: [],
    coveredCategories: 0,
    totalCategories: 2,
    isLoading: false,
  })
}

function renderLive(shell?: LiveShellProps, onBack = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <LiveScreen sourceId={SOURCE_ID} onBack={onBack} onResync={vi.fn()} shell={shell} />
    </Wrapper>,
  )
  return { onBack }
}

/** Toque rápido: keydown + keyup, como um pressionamento normal do controle. */
function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function navEntry(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('.side-category-nav-item')].find((el) =>
    el.textContent?.includes(label),
  )
}

function topbarItem(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('.topbar-item')].find((el) => el.textContent?.includes(label))
}

function previewButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.live-preview-panel button')]
}

function previewButton(label: string): HTMLButtonElement | undefined {
  return previewButtons().find((el) => el.textContent?.includes(label))
}

/** Nome do canal cuja linha tem o foco de estado, ou `null`. */
function focusedChannelName(): string | null {
  const focused = [...document.querySelectorAll('.tv-focus')].find((el) => el.querySelector('.live-item-name'))
  return focused?.querySelector('.live-item-name')?.textContent ?? null
}

describe('LiveScreen — contrato da feature 024', () => {
  beforeEach(async () => {
    mockCatalog()
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
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

  // US1/AC1-AC2, US1/AC5, FR-001, FR-002, FR-003, SC-003
  it('sob a topbar: ↑ em ★ Favoritos sobe para "TV ao vivo", ↓ volta ao mesmo item, RETURN na topbar volta ao Início', () => {
    const shell: LiveShellProps = {
      sourceName: 'Sala',
      onGoHome: vi.fn(),
      onSwitchTop: vi.fn(),
      onOpenProfiles: vi.fn(),
    }
    const { onBack } = renderLive(shell)

    const live = topbarItem('TV ao vivo')
    expect(live).toBeDefined()
    expect(live!.getAttribute('aria-current')).toBe('page')

    tap('ArrowUp') // da 1ª categoria real para "Todos"
    tap('ArrowUp') // para "★ Favoritos"
    expect(navEntry('Favoritos')?.classList.contains('tv-focus')).toBe(true)

    tap('ArrowUp') // sobe para a topbar, no destino atual
    expect(topbarItem('TV ao vivo')?.classList.contains('tv-focus')).toBe(true)
    expect(document.querySelector('.side-category-nav-item.tv-focus')).toBeNull()

    tap('ArrowDown') // volta ao MESMO item, sem andar dentro da coluna
    expect(navEntry('Favoritos')?.classList.contains('tv-focus')).toBe(true)
    expect(topbarItem('TV ao vivo')?.classList.contains('tv-focus')).toBe(false)

    tap('ArrowUp')
    tap('Escape') // RETURN na topbar → Início
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // US2/AC1-AC3, US2/AC5-AC6, FR-014, FR-015, FR-016, FR-018, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('preview: sem canal não tem ação; → leva a "Assistir", favoritar alterna o rótulo, ← volta ao canal, Assistir abre o player', async () => {
    renderLive()

    // Foco na coluna de categorias: orientação neutra, nada focável no preview.
    expect(previewButtons()).toHaveLength(0)

    tap('ArrowRight') // entra em "Esportes"
    expect(focusedChannelName()).toBe('Canal A')

    tap('ArrowRight') // canal → 1ª ação do preview
    expect(previewButton('Assistir')?.classList.contains('tv-focus')).toBe(true)
    expect(focusedChannelName()).toBeNull()

    tap('ArrowDown')
    expect(previewButton('Favoritar')?.classList.contains('tv-focus')).toBe(true)
    tap('Enter')
    await waitFor(() => expect(previewButton('Favorito')).toBeDefined())
    expect(previewButton('Favoritar')).toBeUndefined()

    tap('ArrowLeft') // ação → o mesmo canal de onde saiu
    expect(focusedChannelName()).toBe('Canal A')

    tap('ArrowRight')
    expect(previewButton('Assistir')?.classList.contains('tv-focus')).toBe(true)
    tap('Enter')
    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledTimes(1))
  })
})

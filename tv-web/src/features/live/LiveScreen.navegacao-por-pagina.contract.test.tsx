/**
 * Contrato da feature 049 (navegação por página na TV ao vivo) — travado em
 * `sdd/specs/049-navegacao-por-pagina/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (além dos da 018/024/048, que continuam):
 * - `.live-guide-button`: ícone focável do Guia completo, ao lado de
 *   `.search-icon-button`, com `aria-label="Guia completo"`.
 * - o destaque (`.live-preview-panel`) não tem botões nem elementos focáveis.
 * Página de canais = `floor(clientHeight / 84)` (a altura de linha da lista
 * virtualizada); com o `clientHeight` de 640 deste arquivo, 7 canais.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'

// Mesmos mocks de layout dos contratos 024/030/048: jsdom não faz layout, e o
// painel de canais é virtualizado (feature 009).
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
  define(HTMLElement.prototype, 'offsetWidth', 400)
  define(Element.prototype, 'clientHeight', 640)
  define(Element.prototype, 'scrollHeight', 1_000_000)
  define(HTMLElement.prototype, 'scrollTo', function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
    const top = typeof options === 'object' && options !== null ? options.top : undefined
    if (typeof top === 'number') this.scrollTop = top
    queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
  })
})

afterAll(() => {
  for (const undo of restore.reverse()) undo()
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
  }
})

const SOURCE_ID = 'source-049'
const PAGE = 7 // floor(640 / 84)
const nameOf = (n: number) => `Canal ${String(n).padStart(2, '0')}`

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'channel', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function channel(name: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'channel',
    name,
    original_group: 'Telecine Premium',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    epg_channel_id: null,
  }
}

const CHANNELS = Array.from({ length: 20 }, (_, i) => channel(nameOf(i + 1)))

function mockCatalog() {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category(1, 'Telecine Premium', 0), category(2, 'Notícias', 1)],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat?.id === 1 ? CHANNELS : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 2, isLoading: false })
}

function renderLive() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <Wrapper>
      <LiveScreen sourceId={SOURCE_ID} onBack={vi.fn()} onResync={vi.fn()} />
    </Wrapper>,
  )
}

function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

function focusedChannelName(): string | null {
  const focused = [...document.querySelectorAll('.tv-focus')].find((el) => el.querySelector('.live-item-name'))
  return focused?.querySelector('.live-item-name')?.textContent ?? null
}

function focusedTrailLabel(): string | null {
  return document.querySelector('.live-column-groups .tv-focus .side-category-nav-label')?.textContent ?? null
}

describe('LiveScreen — contrato da feature 049', () => {
  beforeEach(async () => {
    mockCatalog()
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte 049',
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

  // US1 (→/← paginam, param nas bordas), US2 (OK entra, RETURN volta à trilha, foco restaurado), FR-001..FR-006, SC-002/SC-003
  it('→/← paginam a trilha e a lista sem entrar nem tocar; OK entra; RETURN volta à trilha e a reentrada devolve o canal', async () => {
    renderLive()
    expect(focusedTrailLabel()).toBe('Telecine Premium')

    tap('ArrowRight') // trilha: página seguinte — vai ao último e NÃO entra
    await waitFor(() => expect(focusedTrailLabel()).toBe('Notícias'))
    expect(document.querySelectorAll('.live-column-channels .live-item-name')).toHaveLength(0)
    tap('ArrowLeft') // página anterior: primeiro e para
    await waitFor(() => expect(focusedTrailLabel()).toBe('Favoritos'))
    tap('ArrowDown')
    tap('ArrowDown')
    expect(focusedTrailLabel()).toBe('Telecine Premium')

    tap('Enter') // OK entra
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1)))

    tap('ArrowRight')
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1 + PAGE)))
    tap('ArrowRight')
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1 + 2 * PAGE)))
    tap('ArrowRight') // última página: vai ao último canal e para
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(20)))
    tap('ArrowRight')
    expect(focusedChannelName()).toBe(nameOf(20))
    tap('ArrowLeft')
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(20 - PAGE)))

    // Nada tocou, nada abriu: só OK toca.
    expect(vi.mocked(catalogApi.fetchPlayback)).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    tap('Escape') // RETURN: volta à trilha, na categoria da lista aberta
    await waitFor(() => expect(focusedTrailLabel()).toBe('Telecine Premium'))
    tap('Enter') // reentra: o canal lembrado volta (046)
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(20 - PAGE)))
  })

  // US3 (destaque informativo, ícone de Guia ao lado da lupa), FR-007/FR-008, Constitution: setas + OK + RETURN alcançam toda ação
  it('destaque sem botões nem foco; ↑ vai à lupa, → ao ícone de Guia, OK abre o Guia, ↓ volta ao canal', async () => {
    renderLive()
    tap('Enter') // entra em "Telecine Premium"
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1)))

    const panel = document.querySelector('.live-preview-panel') as HTMLElement
    expect(panel.querySelector('.live-hero-name')?.textContent).toBe(nameOf(1))
    expect(panel.querySelectorAll('.live-preview-action, button, [tabindex]')).toHaveLength(0)

    tap('ArrowUp')
    expect(document.querySelector('.search-icon-button.tv-focus')).not.toBeNull()
    tap('ArrowRight')
    const guideButton = document.querySelector<HTMLElement>('.live-guide-button.tv-focus')
    expect(guideButton?.getAttribute('aria-label')).toBe('Guia completo')
    expect(document.querySelector('.search-icon-button.tv-focus')).toBeNull()
    tap('ArrowLeft')
    expect(document.querySelector('.search-icon-button.tv-focus')).not.toBeNull()
    tap('ArrowDown')
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1)))
    expect(document.querySelector('.search-icon-button.tv-focus')).toBeNull()

    tap('ArrowUp')
    tap('ArrowRight')
    tap('Enter') // OK no ícone: o Guia completo, tela cheia
    await waitFor(() => expect(document.querySelector('.epg-guide-screen')).not.toBeNull())
  })

  // FR-010 (campo de busca com foco DOM real: ←/→ são do cursor), FR-004 (paginar só move o foco), caso traiçoeiro de 018
  it('busca: ←/→ no campo são do cursor; com o foco nos resultados, → pagina', async () => {
    renderLive()
    tap('Enter') // entra em "Telecine Premium"
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1)))

    tap('ArrowUp') // lupa
    tap('Enter') // abre o campo
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    expect(field).not.toBeNull()
    act(() => fireEvent.change(field!, { target: { value: 'canal' } }))
    // A lista é virtualizada: só a janela visível está no DOM, mas todos os 20 casam com o termo.
    expect(document.querySelectorAll('.live-column-channels .live-item-name').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('Nenhum resultado')

    act(() => {
      fireEvent.keyDown(field!, { key: 'ArrowRight', bubbles: true })
      fireEvent.keyDown(field!, { key: 'ArrowLeft', bubbles: true })
    })
    expect(document.activeElement).toBe(field) // o campo manteve o foco: nada paginou
    expect(focusedChannelName()).toBeNull()

    tap('ArrowDown') // do campo ao 1º resultado
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1)))
    tap('ArrowRight')
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1 + PAGE)))
    tap('ArrowLeft')
    await waitFor(() => expect(focusedChannelName()).toBe(nameOf(1)))
    expect(vi.mocked(catalogApi.fetchPlayback)).not.toHaveBeenCalled()
  })
})

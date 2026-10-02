/**
 * Navegação por página na TV ao vivo (feature 049) — cobertura complementar ao contrato
 * `LiveScreen.navegacao-por-pagina.contract.test.tsx`: trilha longa, lista curta, seta
 * segurada e estados sem canais (nenhum fica sem saída).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
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

const SOURCE_ID = 'source-049-paginacao'
const category = (id: number, name: string): CatalogCategory => ({
  id,
  kind: 'channel',
  name,
  order: id,
  count: 0,
  fetchMode: 'on_demand',
  providerCategoryId: String(id),
})

const channel = (name: string): CatalogItemOut => ({
  id: `id-${name}`,
  kind: 'channel',
  name,
  original_group: 'Grupo',
  published: true,
  playable: true,
  source_id: SOURCE_ID,
  provider_stream_id: name,
  original_name: name,
  epg_channel_id: null,
})

function mock(categories: CatalogCategory[], itemsFor: (id: number) => CatalogItemOut[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? itemsFor(cat.id) : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: categories.length, isLoading: false })
}

function renderLive() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

const trailLabel = () => document.querySelector('.live-column-groups .tv-focus .side-category-nav-label')?.textContent ?? null
const channelName = () =>
  [...document.querySelectorAll('.tv-focus')].find((el) => el.querySelector('.live-item-name'))?.querySelector('.live-item-name')?.textContent ?? null

describe('LiveScreen — paginação (feature 049)', () => {
  beforeEach(async () => {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte 049 paginação',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('trilha longa: → anda uma página por vez até o fim e ← volta ao início, sem entrar em nada', async () => {
    const cats = Array.from({ length: 25 }, (_, i) => category(i + 1, `Cat ${String(i + 1).padStart(2, '0')}`))
    mock(cats, () => [channel('X')])
    renderLive()
    expect(trailLabel()).toBe('Cat 01') // padrão: a 1ª categoria real (índice 2 da trilha)

    tap('ArrowRight') // 2 + 11 = 13 → "Cat 12"
    await waitFor(() => expect(trailLabel()).toBe('Cat 12'))
    expect(document.querySelectorAll('.live-column-channels .live-item-name')).toHaveLength(0)
    tap('ArrowRight')
    tap('ArrowRight')
    await waitFor(() => expect(trailLabel()).toBe('Cat 25')) // preso ao último
    tap('ArrowRight')
    expect(trailLabel()).toBe('Cat 25')

    tap('ArrowLeft')
    tap('ArrowLeft')
    tap('ArrowLeft')
    await waitFor(() => expect(trailLabel()).toBe('Favoritos')) // preso ao primeiro
    expect(vi.mocked(catalogApi.useCategoryContent).mock.calls.every(([, cat]) => cat === undefined)).toBe(true)
  })

  it('lista curta: → vai ao último canal e ← ao primeiro', async () => {
    mock([category(1, 'Curta')], () => [channel('Canal 1'), channel('Canal 2'), channel('Canal 3')])
    renderLive()
    tap('Enter')
    await waitFor(() => expect(channelName()).toBe('Canal 1'))
    tap('ArrowRight')
    await waitFor(() => expect(channelName()).toBe('Canal 3'))
    tap('ArrowLeft')
    await waitFor(() => expect(channelName()).toBe('Canal 1'))
  })

  it('seta segurada: repetições seguidas atravessam as páginas, param no último e nunca tocam nem consultam rede', async () => {
    const many = Array.from({ length: 60 }, (_, i) => channel(`Canal ${String(i + 1).padStart(2, '0')}`))
    mock([category(1, 'Longa')], () => many)
    renderLive()
    tap('Enter')
    await waitFor(() => expect(channelName()).toBe('Canal 01'))

    for (let i = 0; i < 20; i += 1) {
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: i > 0, bubbles: true }))
      })
    }
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
    })
    await waitFor(() => expect(channelName()).toBe('Canal 60'))
    expect(vi.mocked(catalogApi.fetchPlayback)).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('categoria vazia: o botão do estado volta à trilha com OK e RETURN também — nunca preso', async () => {
    mock([category(1, 'Vazia')], () => [])
    renderLive()
    tap('Enter') // entra: "Este grupo está vazio." com a ação "Voltar"
    await waitFor(() => expect(document.body.textContent).toContain('Este grupo está vazio'))
    expect(trailLabel()).toBeNull() // o foco está na ação do estado, não na trilha

    tap('Enter') // OK na ação
    await waitFor(() => expect(trailLabel()).toBe('Vazia'))

    tap('Enter')
    await waitFor(() => expect(trailLabel()).toBeNull())
    tap('Escape') // RETURN
    await waitFor(() => expect(trailLabel()).toBe('Vazia'))
  })

  it('↑ do 1º canal continua indo à lupa; ← na linha do topo não pagina nem sai dela', async () => {
    mock([category(1, 'Longa')], () => [channel('Canal 1'), channel('Canal 2')])
    renderLive()
    tap('Enter')
    await waitFor(() => expect(channelName()).toBe('Canal 1'))
    tap('ArrowUp')
    expect(document.querySelector('.search-icon-button.tv-focus')).not.toBeNull()
    tap('ArrowLeft')
    tap('ArrowRight') // lupa → guia
    tap('ArrowRight') // já no último ícone: fica
    expect(document.querySelector('.live-guide-button.tv-focus')).not.toBeNull()
    tap('ArrowLeft')
    expect(document.querySelector('.search-icon-button.tv-focus')).not.toBeNull()
  })
})

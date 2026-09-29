/**
 * Contrato da feature 031 (EPG — Guia completo) — travado em
 * `sdd/specs/031-epg-guia-completo/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (além dos do contrato do `EpgGuide`):
 * - `.live-preview-panel` e seus botões (identificados pelo texto, como no
 *   contrato da 024): "Assistir", "Favoritar"/"Favorito", "Guia completo".
 * - `.live-channel-row.tv-focus .live-item-name`: o canal focado na lista.
 * - `.epg-guide`: raiz do guia (ver o contrato do `EpgGuide`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { deleteEpgForSource, writeEpgPrograms } from '../../lib/epg/epgRepository'

const saved: Record<string, PropertyDescriptor | undefined> = {}
beforeAll(() => {
  saved.offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  saved.offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  saved.clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  saved.scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  saved.scrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1344 })
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
  if (saved.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight)
  if (saved.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', saved.offsetWidth)
  if (saved.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', saved.clientHeight)
  if (saved.scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', saved.scrollHeight)
  if (saved.scrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', saved.scrollTo)
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
    // `useEpgPrograms`, `useFavoriteIds`/`useToggleFavorite` e `useSources`: reais, contra `db` (fake-indexeddb).
  }
})

const SOURCE_ID = 'source-guia-live'
const at = (hour: number, minute = 0) => new Date(2026, 8, 29, hour, minute, 0, 0).getTime()

const channel = (name: string, streamId: string, epgId: string): CatalogItemOut => ({
  id: `id-${name}`,
  kind: 'channel',
  name,
  original_group: 'Notícias',
  published: true,
  playable: true,
  source_id: SOURCE_ID,
  provider_stream_id: streamId,
  original_name: name,
  epg_channel_id: epgId,
})

function mockCatalog() {
  const category: CatalogCategory = { id: 1, kind: 'channel', name: 'Notícias', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' }
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({ data: [category], isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat?.id === 1 ? [channel('Canal A', 'a', 'a.br'), channel('Canal B', 'b', 'b.br')] : []
    return { data: { items, totalCount: items.length, outcome: 'fresh' }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
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

const focusedChannelName = () => document.querySelector('.live-channel-row.tv-focus .live-item-name')?.textContent ?? null

describe('LiveScreen — contrato da feature 031', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(10, 30))
    mockCatalog()
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte com EPG',
      providerDns: 'http://painel.test',
      providerUsername: 'usuario-teste',
      providerPassword: 'senha-teste',
      connectionState: 'synced',
      activeGeneration: 1,
      epgLastSyncAt: at(10),
      createdAt: 0,
      updatedAt: 0,
    })
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'a.br', start: at(10), end: at(11), title: 'Programa do A' },
      { channelKey: 'b.br', start: at(10), end: at(12), title: 'Programa do B' },
    ])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await deleteEpgForSource(SOURCE_ID).catch(() => {})
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  // US1/AC1, US1/AC4, FR-009, FR-011, FR-012, Constitution: "Voltar Restaura Foco e Posição"
  it('"Guia completo" do preview abre o guia (já não é "Em breve") no canal de origem, e RETURN volta à lista com o foco nesse mesmo canal', async () => {
    renderLive()
    tap('ArrowRight') // entra em "Notícias"
    tap('ArrowDown') // foca "Canal B" — a origem NÃO é o primeiro da lista
    expect(focusedChannelName()).toBe('Canal B')

    tap('ArrowRight') // canal → "Assistir" no preview
    tap('ArrowDown') // "Favoritar"
    tap('ArrowDown') // "Guia completo"
    tap('Enter')

    await waitFor(() => expect(document.querySelector('.epg-guide')).not.toBeNull())
    expect(document.body.textContent).not.toMatch(/Em breve/)
    // O foco do guia está no programa do canal de origem, não no primeiro canal.
    await waitFor(() => expect(document.querySelector('.epg-guide-block.tv-focus')?.textContent).toContain('Programa do B'))

    tap('Escape') // RETURN: fecha o guia
    await waitFor(() => expect(document.querySelector('.epg-guide')).toBeNull())
    expect(focusedChannelName()).toBe('Canal B')
  })
})

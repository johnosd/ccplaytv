/**
 * Feature 031 — o guia dentro do `LiveScreen` (além do contrato travado):
 * abrir em "Todos", assistir pelo guia, RETURN do player caindo no canal
 * escolhido (FR-012/FR-020). Testes da fase, fora da trava.
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
  }
})

const SOURCE_ID = 'source-guia-live-2'
const at = (hour: number, minute = 0) => new Date(2026, 8, 29, hour, minute, 0, 0).getTime()

const channel = (name: string, epgId: string): CatalogItemOut => ({
  id: `id-${name}`,
  kind: 'channel',
  name,
  original_group: 'Notícias',
  published: true,
  playable: true,
  source_id: SOURCE_ID,
  provider_stream_id: name,
  original_name: name,
  epg_channel_id: epgId,
})

const CHANNELS = [channel('Canal A', 'a.br'), channel('Canal B', 'b.br'), channel('Canal C', 'c.br')]

function mockCatalog() {
  const category: CatalogCategory = { id: 1, kind: 'channel', name: 'Notícias', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' }
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({ data: [category], isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat?.id === 1 ? CHANNELS : []
    return { data: { items, totalCount: items.length, outcome: 'fresh' }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: CHANNELS, coveredCategories: 1, totalCategories: 1, isLoading: false })
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
const guideFocusText = () => document.querySelector('.epg-guide-block.tv-focus')?.textContent ?? ''

/** Da trilha: entra na lista de canais e vai até o canal de índice `index`, abrindo o "Guia completo" dele. */
function openGuideOn(index: number, viaAll = false) {
  if (viaAll) tap('ArrowUp') // 1ª categoria real → "Todos"
  tap('ArrowRight')
  for (let i = 0; i < index; i += 1) tap('ArrowDown')
  tap('ArrowRight') // preview: "Assistir"
  tap('ArrowDown') // "Favoritar"
  tap('ArrowDown') // "Guia completo"
  tap('Enter')
}

describe('LiveScreen — Guia completo (feature 031)', () => {
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
      providerUsername: 'u',
      providerPassword: 'p',
      connectionState: 'synced',
      activeGeneration: 1,
      epgLastSyncAt: at(10),
      createdAt: 0,
      updatedAt: 0,
    })
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'a.br', start: at(10), end: at(11), title: 'Programa do A' },
      { channelKey: 'b.br', start: at(10), end: at(12), title: 'Programa do B' },
      { channelKey: 'c.br', start: at(10), end: at(12), title: 'Programa do C' },
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

  it('aberto em "Todos", o guia usa a lista de Todos e RETURN restaura o foco no canal de origem, por id', async () => {
    renderLive()
    openGuideOn(2, true) // "Canal C" em "Todos"

    await waitFor(() => expect(guideFocusText()).toContain('Programa do C'))
    expect(document.querySelector('.epg-guide-coverage')?.textContent).toBe('Guia de 1 de 1 categorias')

    tap('Escape')
    await waitFor(() => expect(document.querySelector('.epg-guide')).toBeNull())
    expect(focusedChannelName()).toBe('Canal C')
  })

  it('OK num programa toca o canal (a lista do guia vira a vizinhança) e RETURN do player cai no canal escolhido', async () => {
    renderLive()
    openGuideOn(0) // origem: "Canal A"
    await waitFor(() => expect(guideFocusText()).toContain('Programa do A'))

    tap('ArrowDown') // "Canal B"
    await waitFor(() => expect(guideFocusText()).toContain('Programa do B'))
    tap('Enter')

    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledWith('id-Canal B'))
    expect(document.querySelector('.epg-guide')).toBeNull() // parado: o player cobre tudo e o guia fecha na hora

    tap('Escape') // RETURN do player
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    expect(focusedChannelName()).toBe('Canal B')
  })

  it('mover o foco no guia nunca dispara rede nem reprodução (FR-018)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderLive()
    openGuideOn(0)
    await waitFor(() => expect(guideFocusText()).toContain('Programa do A'))

    tap('ArrowDown')
    tap('ArrowDown')
    tap('ArrowRight')
    tap('ArrowUp')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

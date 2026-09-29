/**
 * Contrato da feature 030 (EPG — dados e "Agora") — travado em
 * `sdd/specs/030-epg-dados-agora/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato:
 * - `.live-item-name`: nome do canal na linha (já fixado pela 018).
 * - `.channel-row`: a linha (`ChannelRow`, feature 022); dentro dela,
 *   `.channel-row-now` (slot "Agora", sempre presente, vazio sem EPG) e
 *   `.channel-row-progress` (só existe com programa atual).
 *
 * A programação entra pelo repositório real (`writeEpgPrograms`) no `db`
 * padrão (fake-indexeddb) — a tela não pode depender de outra porta.
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
    // Leitura de EPG: real, contra `db` (fake-indexeddb).
  }
})

const SOURCE_ID = 'source-epg'
const at = (hour: number, minute = 0) => Date.UTC(2026, 8, 29, hour, minute, 0)

function channel(name: string, streamId: string, epgId: string | null): CatalogItemOut {
  return {
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
  }
}

function mockCatalog() {
  const category: CatalogCategory = {
    id: 1,
    kind: 'channel',
    name: 'Notícias',
    order: 0,
    count: 0,
    fetchMode: 'on_demand',
    providerCategoryId: '1',
  }
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: [category],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat?.id === 1 ? [channel('Canal Com Guia', 'a', 'a.br'), channel('Canal Sem Guia', 'b', null)] : []
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
    totalCategories: 1,
    isLoading: false,
  })
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

/** A `ChannelRow` cujo nome é `name`. */
function rowOf(name: string): HTMLElement | null {
  const nameEl = [...document.querySelectorAll<HTMLElement>('.live-item-name')].find((el) => el.textContent === name)
  return nameEl?.closest<HTMLElement>('.channel-row') ?? null
}

describe('LiveScreen — contrato da feature 030', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(10, 30))
    mockCatalog()
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte com EPG',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'a.br', start: at(10), end: at(11), title: 'Jornal da Manhã' },
      { channelKey: 'a.br', start: at(11), end: at(12), title: 'Esporte Total' },
    ])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await deleteEpgForSource(SOURCE_ID).catch(() => {})
    await db.sources.delete(SOURCE_ID)
  })

  // US1/AC1-AC2, FR-023 (programa atual + progresso real), FR-029 (só do aparelho), FR-030 (sem EPG = slot vazio, sem barra), SC-003
  it('linha de canal: com id de EPG mostra o programa atual e a barra; sem id, slot vazio e sem barra', async () => {
    renderLive()
    tap('ArrowRight') // entra em "Notícias"

    await waitFor(() => expect(rowOf('Canal Com Guia')?.querySelector('.channel-row-now')?.textContent).toBe('Jornal da Manhã'))
    expect(rowOf('Canal Com Guia')?.querySelector('.channel-row-progress')).not.toBeNull()

    const without = rowOf('Canal Sem Guia')
    expect(without).not.toBeNull()
    expect(without?.querySelector('.channel-row-now')?.textContent).toBe('')
    expect(without?.querySelector('.channel-row-progress')).toBeNull()
  })
})

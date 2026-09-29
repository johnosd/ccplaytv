/**
 * Feature 031, US4 — trocar de lista dentro do guia. Testes da fase, fora da trava.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EpgGuide, type EpgGuideHandle } from './EpgGuide'
import * as catalogApi from '../../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../../catalog/catalogApi'
import { db } from '../../../lib/catalog/db'

const saved: Record<string, PropertyDescriptor | undefined> = {}
beforeAll(() => {
  saved.offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  saved.clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
})
afterAll(() => {
  if (saved.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight)
  if (saved.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', saved.clientHeight)
})

vi.mock('../../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../catalog/catalogApi')>()
  return { ...actual, useCategoryContent: vi.fn(), useFavoritesContent: vi.fn(), useAggregatedItems: vi.fn(), useEpgPrograms: vi.fn() }
})

const SOURCE_ID = 'source-guia-seletor'
const cat = (id: number, name: string): CatalogCategory => ({ id, kind: 'channel', name, order: id, count: 1, fetchMode: 'on_demand', providerCategoryId: String(id) })
const CATEGORIES = [cat(1, 'Notícias'), cat(2, 'Esportes')]
const channel = (name: string): CatalogItemOut => ({
  id: `id-${name}`,
  kind: 'channel',
  name,
  original_group: null,
  published: true,
  playable: true,
  source_id: SOURCE_ID,
  provider_stream_id: name,
  original_name: name,
  epg_channel_id: null,
})

describe('EpgGuide — seletor de lista (US4)', () => {
  beforeEach(async () => {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      providerDns: 'http://painel.test',
      providerUsername: 'u',
      providerPassword: 'p',
      connectionState: 'synced',
      activeGeneration: 1,
      epgLastSyncAt: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    vi.mocked(catalogApi.useCategoryContent).mockImplementation((_id, category) => {
      const items = category?.id === 2 ? [channel('Sportv')] : [channel('Globo News')]
      return { data: { items, totalCount: items.length, outcome: 'fresh' }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
    })
    vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({ data: { items: [], unresolved: 0 }, isLoading: false, isError: false } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [channel('Globo News'), channel('Sportv')], coveredCategories: 2, totalCategories: 3, isLoading: false })
    vi.mocked(catalogApi.useEpgPrograms).mockReturnValue({ data: { byKey: new Map(), offsetMs: 0 } } as unknown as ReturnType<typeof catalogApi.useEpgPrograms>)
  })
  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
  })

  async function setup() {
    const handle = createRef<EpgGuideHandle>()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    const onClose = vi.fn()
    render(<EpgGuide sourceId={SOURCE_ID} categories={CATEGORIES} initialList={{ kind: 'category', id: 1 }} initialChannelId={null} onWatch={vi.fn()} onClose={onClose} handleRef={handle} />, { wrapper: Wrapper })
    await screen.findByRole('tablist')
    return { handle, onClose }
  }
  const key = (handle: { current: EpgGuideHandle | null }, dir: 'up' | 'down') => act(() => handle.current!.onDirection(dir))

  it('abre com o foco na lista atual, escolhe outra categoria e o guia carrega os canais dela; nenhuma requisição', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { handle } = await setup()

    key(handle, 'up') // grade → barra (seletor)
    act(() => handle.current!.onSelect())
    expect(screen.getByRole('option', { name: 'Notícias' })).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelector('.epg-guide-selector-entry.tv-focus')?.textContent).toBe('Notícias')

    key(handle, 'down')
    expect(document.querySelector('.epg-guide-selector-entry.tv-focus')?.textContent).toBe('Esportes')
    act(() => handle.current!.onSelect())

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(document.querySelector('.epg-guide-detail-channel')?.textContent).toBe('Sportv')
    expect(document.querySelector('.epg-guide-selector')?.textContent).toBe('Esportes')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('RETURN em camadas: fecha o seletor sem sair; outro RETURN fecha o guia', async () => {
    const { handle, onClose } = await setup()
    key(handle, 'up')
    act(() => handle.current!.onSelect())
    act(() => handle.current!.onBack())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    act(() => handle.current!.onBack())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('"Todos" mostra a cobertura "Guia de X de Y categorias"', async () => {
    const { handle } = await setup()
    key(handle, 'up')
    act(() => handle.current!.onSelect())
    key(handle, 'up') // Notícias → Todos
    act(() => handle.current!.onSelect())
    expect(document.querySelector('.epg-guide-coverage')?.textContent).toBe('Guia de 2 de 3 categorias')
  })
})

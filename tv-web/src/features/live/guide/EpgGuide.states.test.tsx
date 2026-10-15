/**
 * Feature 031, US1 — todo estado do guia tem um elemento focável e ativável
 * (constitution, "Foco Visível e Sem Becos Sem Saída"): carregando, erro,
 * lista vazia e "sem programação" (EPG não configurado/desativado/nunca
 * sincronizado). Testes da fase, fora da trava.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EpgGuide, type EpgGuideHandle, type EpgGuideProps } from './EpgGuide'
import * as catalogApi from '../../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../../catalog/catalogApi'
import { db, type SourceRecord } from '../../../lib/catalog/db'
import { findUnnamedControls } from '../../../testing/accessibleNames'

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
  return { ...actual, useCategoryContent: vi.fn(), useFavoritesContent: vi.fn(), useAggregatedItems: vi.fn() }
})

const SOURCE_ID = 'source-guia-estados'
const CATEGORY: CatalogCategory = { id: 1, kind: 'channel', name: 'Notícias', order: 0, count: 1, fetchMode: 'on_demand', providerCategoryId: '1' }
const CHANNEL: CatalogItemOut = {
  id: 'id-A',
  kind: 'channel',
  name: 'Canal A',
  original_group: 'Notícias',
  published: true,
  playable: true,
  source_id: SOURCE_ID,
  provider_stream_id: 'a',
  original_name: 'Canal A',
  epg_channel_id: 'a.br',
}

function mockContent(state: { items?: CatalogItemOut[]; isLoading?: boolean; isError?: boolean; refetch?: () => void }) {
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: state.isLoading ? undefined : { items: state.items ?? [], totalCount: (state.items ?? []).length, outcome: 'fresh' },
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    refetch: state.refetch ?? vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({ data: { items: [], unresolved: 0 }, isLoading: false, isError: false } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
}

const linkedSource: SourceRecord = {
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
}

function renderGuide(overrides: Partial<EpgGuideProps> = {}) {
  const handle = createRef<EpgGuideHandle>()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const props: EpgGuideProps = {
    sourceId: SOURCE_ID,
    categories: [CATEGORY],
    initialList: { kind: 'category', id: 1 },
    initialChannelId: null,
    onWatch: vi.fn(),
    onClose: vi.fn(),
    handleRef: handle,
    ...overrides,
  }
  render(<EpgGuide {...props} />, { wrapper: Wrapper })
  return { handle, props }
}

const press = (handle: { current: EpgGuideHandle | null }, direction: 'up' | 'down' | 'left' | 'right') => act(() => handle.current!.onDirection(direction))
const oneFocus = () => expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)

describe('EpgGuide — estados (US1)', () => {
  beforeEach(async () => {
    await db.sources.put(linkedSource)
  })
  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.delete(SOURCE_ID)
  })

  it('carregando: mostra o estado e o seletor de lista é focável e abre; RETURN fecha o seletor e só então o guia', async () => {
    mockContent({ isLoading: true })
    const { handle, props } = renderGuide()

    expect(await screen.findByText('Carregando canais…')).toBeInTheDocument()
    expect(document.querySelector('.epg-guide-selector')).toHaveClass('tv-focus')
    oneFocus()

    act(() => handle.current!.onSelect()) // OK no seletor
    expect(screen.getByRole('listbox', { name: 'Escolher lista' })).toBeInTheDocument()
    expect([...document.querySelectorAll('.epg-guide-selector-entry')].map((el) => el.textContent)).toEqual(['★ Favoritos', 'Todos', 'Notícias'])
    oneFocus()

    act(() => handle.current!.onBack()) // fecha só o seletor
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(props.onClose).not.toHaveBeenCalled()
    act(() => handle.current!.onBack())
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('erro: "Tentar de novo" é alcançável (↓) e ativável (OK); nunca só um aviso', async () => {
    const refetch = vi.fn()
    mockContent({ isError: true, refetch })
    const { handle } = renderGuide()

    expect(await screen.findByText('Não foi possível carregar os canais desta lista.')).toBeInTheDocument()
    await press(handle, 'down')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveClass('tv-focus')
    oneFocus()
    act(() => handle.current!.onSelect())
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('lista vazia: "Trocar lista" é alcançável e abre o seletor', async () => {
    mockContent({ items: [] })
    const { handle } = renderGuide()

    expect(await screen.findByText('Nenhum canal nesta lista')).toBeInTheDocument()
    await press(handle, 'down')
    expect(screen.getByRole('button', { name: 'Trocar lista' })).toHaveClass('tv-focus')
    act(() => handle.current!.onSelect())
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it.each([
    ['not_configured', 'Esta lista não tem EPG configurado.', { type: 'm3u_url' as const, m3uUrl: 'http://lista.test/avulsa.m3u', providerDns: undefined, providerUsername: undefined, providerPassword: undefined, epgLastSyncAt: undefined }],
    ['disabled', 'O EPG desta lista está desativado.', { epgDisabled: true }],
    ['never_synced', 'O EPG desta lista ainda não foi sincronizado.', { epgLastSyncAt: undefined }],
  ])('sem programação (%s): explica e diz onde configurar, sem atalho para fora do guia — o seletor segue focável', async (_state, text, patch) => {
    // Item 62a do backlog (decisão do usuário): o EPG só se configura ao editar
    // a lista em Configurações — nunca a partir do guia do canal.
    await db.sources.put({ ...linkedSource, ...patch })
    mockContent({ items: [CHANNEL] })
    const { handle } = renderGuide()

    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.getByText('O EPG é configurado em Configurações › Fontes IPTV, na linha da lista.')).toBeInTheDocument()
    expect(document.querySelector('.epg-guide-grid')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Configurar EPG' })).not.toBeInTheDocument()
    await press(handle, 'down')
    expect(document.querySelector('.epg-guide-selector')).toHaveClass('tv-focus')
    oneFocus()
  })

  it('todo controle do guia tem nome acessível (estado de erro e seletor aberto)', async () => {
    mockContent({ isError: true })
    const { handle } = renderGuide()
    await screen.findByText('Não foi possível carregar os canais desta lista.')
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])

    act(() => handle.current!.onSelect())
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })
})

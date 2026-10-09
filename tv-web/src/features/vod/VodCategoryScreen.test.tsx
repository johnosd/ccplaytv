/**
 * Tela de categoria de Filmes/Séries (feature 052) — comportamento herdado do antigo `VodCatalogScreen` (025/036/039),
 * agora com a entrada vinda de `target` e sem trilha, sidebar e hero. Complementa o contrato travado
 * (`VodCategoryScreen.vitrine-filmes-series.contract.test.tsx`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VodCategoryScreen } from './VodCategoryScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { resetVodSessionMemory } from './vodSessionMemory'
import type { VodCategoryRestore, VodTarget } from './vodTarget'
import { db } from '../../lib/catalog/db'
import { updateProgress } from '../../lib/catalog/userStateRepository'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import { findUnnamedControls } from '../../testing/accessibleNames'

let restoreOffsetHeight: PropertyDescriptor | undefined
let restoreOffsetWidth: PropertyDescriptor | undefined
let restoreClientHeight: PropertyDescriptor | undefined
let restoreScrollHeight: PropertyDescriptor | undefined
let restoreScrollTo: PropertyDescriptor | undefined
let restoreResizeObserver: typeof globalThis.ResizeObserver | undefined

beforeAll(() => {
  restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  restoreClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  restoreScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  restoreScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
  restoreResizeObserver = globalThis.ResizeObserver

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1200 })
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
})

afterAll(() => {
  if (restoreOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  if (restoreClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', restoreClientHeight)
  if (restoreScrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', restoreScrollHeight)
  if (restoreScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', restoreScrollTo)
  globalThis.ResizeObserver = restoreResizeObserver as typeof ResizeObserver
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    useAggregatedItems: vi.fn(),
    resolveCatalogItemId: vi.fn(async (itemId: string) => itemId),
    // Favoritos/assistidos/histórico/retomada: reais, contra fake-indexeddb.
  }
})

const SOURCE_ID = 'source-vod-catalog'
const ACAO: VodTarget = { kind: 'category', name: 'Ação' }

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'movie', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function movie(name: string, streamId: string, year?: number, addedAt?: number): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: streamId,
    original_name: name,
    year: year ?? null,
    added_at: addedAt ?? null,
  }
}

function mockCategories(categories: CatalogCategory[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
}

function mockContentByCategory(byId: Record<number, CatalogItemOut[]>) {
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? (byId[cat.id] ?? []) : []
    return {
      data: { items, totalCount: items.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
}

function mockAggregated(items: CatalogItemOut[]) {
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items,
    coveredCategories: 0,
    totalCategories: 0,
    isLoading: false,
  })
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Títulos na grade, na ordem em que aparecem. */
function gridTitles(): string[] {
  return [...document.querySelectorAll('.vod-grid .content-card-title')].map((el) => el.textContent ?? '')
}

function focusedTitle(): string | undefined {
  const cell = [...document.querySelectorAll('.vod-grid-cell')].find((c) => c.querySelector('.tv-focus'))
  return cell?.querySelector('.content-card-title')?.textContent ?? undefined
}

async function seedSource(): Promise<void> {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte de teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
}

interface RenderOptions {
  restore?: VodCategoryRestore
  onOpenItem?: (itemId: string, restore: VodCategoryRestore) => void
  onBack?: () => void
  onResync?: () => void
  initialTopbarItem?: 'search' | 'settings'
  withShell?: boolean
}

function renderCategory(target: VodTarget = ACAO, options: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  const onBack = options.onBack ?? vi.fn()
  const result = render(
    <Wrapper>
      <VodCategoryScreen
        section="movies"
        sourceId={SOURCE_ID}
        target={target}
        onOpenItem={options.onOpenItem ?? vi.fn()}
        restore={options.restore}
        onBack={onBack}
        onResync={options.onResync ?? vi.fn()}
        initialTopbarItem={options.initialTopbarItem}
        shell={
          options.withShell
            ? { sourceName: 'Sala', onGoHome: vi.fn(), onSwitchTop: vi.fn(), onOpenProfiles: vi.fn() }
            : undefined
        }
      />
    </Wrapper>,
  )
  return { ...result, onBack }
}

beforeEach(async () => {
  resetVodSessionMemory()
  await seedSource()
  mockAggregated([])
  mockCategories([category(1, 'Ação', 0)])
  mockContentByCategory({})
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('VodCategoryScreen — estados, "Todos" e memória', () => {
  // Feature 028, FR-007/FR-009: o botão "Voltar" focado dos estados vazios/carregando age (RETURN do usuário).
  it('carregando: OK em "Voltar" volta à vitrine', () => {
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    const { onBack } = renderCategory()
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('categoria vazia (sem falha): OK em "Voltar" volta à vitrine', () => {
    mockContentByCategory({ 1: [] })
    const { onBack } = renderCategory()
    expect(screen.getByText('Esta categoria está vazia.')).toBeInTheDocument()
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('"Todos" vazio: OK em "Voltar" volta à vitrine', () => {
    mockAggregated([])
    const { onBack } = renderCategory({ kind: 'all' })
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('categoria que não existe mais (nome sem correspondência): estado vazio focável, nunca trava', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a')] })
    const { onBack } = renderCategory({ kind: 'category', name: 'Sumiu' })
    expect(screen.getByText('Esta categoria está vazia.')).toBeInTheDocument()
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('lista de categorias carregando/erro/vazia: estado próprio com saída focável', () => {
    vi.mocked(catalogApi.useCategoryList).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
    const loading = renderCategory()
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
    loading.unmount()

    vi.mocked(catalogApi.useCategoryList).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
    const failed = renderCategory()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    failed.unmount()

    mockCategories([])
    renderCategory()
    expect(screen.getByText('Nenhum filme nesta lista')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
  })

  // Feature 039 (T022): "Todos" aos poucos — a tela pede a próxima página perto do fim.
  it('"Todos" na ordem da fonte lê aos poucos e pede mais quando o foco chega a 10 fileiras do fim', () => {
    const loadMore = vi.fn()
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
      items: Array.from({ length: 120 }, (_, i) => movie(`Filme ${i}`, `m${i}`)),
      coveredCategories: 1,
      totalCategories: 1,
      isLoading: false,
      hasMore: true,
      loadMore,
    })
    renderCategory({ kind: 'all' })
    expect(vi.mocked(catalogApi.useAggregatedItems)).toHaveBeenLastCalledWith(SOURCE_ID, 'movie', true, { progressive: true })
    expect(loadMore).not.toHaveBeenCalled() // 1º card, longe do fim (120 lidos)

    for (let row = 0; row < 9; row += 1) press('ArrowDown')
    expect(loadMore).not.toHaveBeenCalled() // fileira 10: índice 54 < 120 − 60
    press('ArrowDown') // fileira 11: índice 60 = 120 − 60
    expect(loadMore).toHaveBeenCalled()
  })

  it('"Todos" com a busca aberta lê o tipo inteiro (sem aos poucos)', () => {
    mockAggregated([movie('Filme A', 'a')])
    renderCategory({ kind: 'all' })
    press('ArrowUp') // grade -> "Pesquisar"
    press('Enter') // abre a busca
    expect(vi.mocked(catalogApi.useAggregatedItems)).toHaveBeenLastCalledWith(SOURCE_ID, 'movie', true, { progressive: false })
  })

  function renderAllRestoringFocus(focusedItemId: string, loadMore: () => void) {
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
      items: Array.from({ length: 300 }, (_, i) => movie(`Filme ${i}`, `m${i}`)),
      coveredCategories: 1,
      totalCategories: 1,
      isLoading: false,
      hasMore: true,
      loadMore,
    })
    renderCategory({ kind: 'all' }, { restore: { focusedItemId, searchTerm: '', searchActive: false } })
  }

  it('voltar a "Todos" com um item focado que saiu da lista não lê o tipo inteiro atrás dele', async () => {
    vi.mocked(catalogApi.resolveCatalogItemId).mockResolvedValueOnce(null)
    const loadMore = vi.fn()
    renderAllRestoringFocus('id-Saiu', loadMore)
    await waitFor(() => expect(catalogApi.resolveCatalogItemId).toHaveBeenCalledWith('id-Saiu'))
    await act(async () => {})
    expect(loadMore).not.toHaveBeenCalled()
  })

  it('voltar a "Todos" com o item focado ainda não lido continua lendo páginas até ele aparecer', async () => {
    const loadMore = vi.fn()
    renderAllRestoringFocus('id-Filme 5000', loadMore)
    await waitFor(() => expect(loadMore).toHaveBeenCalled())
  })

  it('erro de conteúdo: OK em "Tentar de novo" chama o refetch', () => {
    const refetch = vi.fn()
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: [], totalCount: 0, outcome: 'failed' },
      isLoading: false,
      isError: false,
      refetch,
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    renderCategory()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveClass('tv-focus')
    press('Enter')
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('categoria "stored" sem arquivo guardado mostra "Ressincronizar lista", e OK aciona onResync (feature 014, D-008)', () => {
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: [], totalCount: 0, outcome: 'source_missing' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    const onResync = vi.fn()
    renderCategory(ACAO, { onResync })
    press('Enter')
    expect(onResync).toHaveBeenCalledTimes(1)
  })

  it('a grade tem .no-scrollbar e distribui as 6 colunas (variável --lane)', () => {
    mockContentByCategory({ 1: Array.from({ length: 12 }, (_, i) => movie(`Filme ${i}`, `m${i}`)) })
    renderCategory()
    expect(document.querySelector('.vod-grid')).toHaveClass('no-scrollbar')
    const lanes = new Set(
      [...document.querySelectorAll('.vod-grid .vod-grid-cell')].map((el) => (el as HTMLElement).style.getPropertyValue('--lane')),
    )
    expect(lanes.size).toBe(6)
  })

  it('nunca dispara leitura ao mudar o foco — só a categoria aberta é pedida', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a'), movie('Filme B', 'b')] })
    renderCategory()
    press('ArrowRight')
    press('ArrowLeft')
    const requested = vi
      .mocked(catalogApi.useCategoryContent)
      .mock.calls.map(([, cat]) => cat?.id)
      .filter((id) => id !== undefined)
    expect(new Set(requested)).toEqual(new Set([1]))
  })

  it('memória de foco por entrada sobrevive a desmontar e remontar a tela (ida ao detalhe/Início e volta)', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a'), movie('Filme B', 'b'), movie('Filme C', 'c')] })
    const first = renderCategory()
    press('ArrowRight')
    press('ArrowRight')
    expect(focusedTitle()).toBe('Filme C')
    first.unmount() // vodSessionMemory é módulo, sobrevive

    renderCategory()
    expect(focusedTitle()).toBe('Filme C')
  })

  it('← na 1ª coluna não faz nada (não há mais trilha) e ↑ da 1ª linha vai à toolbar', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a'), movie('Filme B', 'b')] })
    const { onBack } = renderCategory()
    press('ArrowLeft')
    expect(focusedTitle()).toBe('Filme A')
    expect(onBack).not.toHaveBeenCalled()
    press('ArrowUp')
    expect(document.querySelector('.vod-toolbar-search-button')).toHaveClass('tv-focus')
  })

  it('com a moldura, ↑ da toolbar leva à topbar e ↓ devolve à grade', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a')] })
    renderCategory(ACAO, { withShell: true })
    press('ArrowUp') // grade -> Pesquisar
    press('ArrowUp') // Pesquisar -> topbar
    expect(document.querySelectorAll('.topbar .tv-focus').length).toBe(1)
    expect(document.querySelectorAll('.vod-toolbar-search-button.tv-focus')).toHaveLength(0)
  })
})

describe('VodCategoryScreen — nomes acessíveis (feature 028, FR-015/FR-017)', () => {
  it('grade com itens e busca aberta', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a'), movie('Filme B', 'b')] })
    const { container } = renderCategory()
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
    press('ArrowUp')
    press('Enter') // abre o campo
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('categoria vazia e erro de conteúdo', () => {
    mockContentByCategory({ 1: [] })
    const empty = renderCategory()
    expect(findUnnamedControls(empty.container).map((f) => f.description)).toEqual([])
    empty.unmount()

    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: [], totalCount: 0, outcome: 'failed' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    const failed = renderCategory()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(findUnnamedControls(failed.container).map((f) => f.description)).toEqual([])
  })
})

describe('VodCategoryScreen — "↺ Histórico" (feature 025, US2, T041)', () => {
  async function seedMovie(name: string, streamId: string): Promise<number> {
    const id = await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name,
      originalName: name,
      groupOrder: 0,
      providerStreamId: streamId,
    })
    return id as number
  }

  it('lista os reproduzidos do mais recente pro mais antigo, com concluídos', async () => {
    await seedMovie('Filme A', 'a')
    await seedMovie('Filme B', 'b')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100) // reproduzido primeiro
    await updateProgress(`${SOURCE_ID}|movie|id:b`, SOURCE_ID, 50)
    await db.userStates.update(`${SOURCE_ID}|movie|id:b`, { completedAt: Date.now() }) // concluído, mais recente
    renderCategory({ kind: 'history' })
    await waitFor(() => expect(gridTitles()).toEqual(['Filme B', 'Filme A']))
  })

  it('vazio: estado instrutivo com "Voltar" focável, sem beco sem saída', async () => {
    const { onBack } = renderCategory({ kind: 'history' })
    expect(await screen.findByText('Seu histórico está vazio')).toBeInTheDocument()
    expect(screen.getByText(/reproduzidos neste perfil aparecerão aqui/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('reprodução sem correspondência no catálogo atual não vira card — nota diz quantas, nunca inventa título/capa', async () => {
    await seedMovie('Filme A', 'a')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100)
    await updateProgress(`${SOURCE_ID}|movie|id:removido`, SOURCE_ID, 200) // sem registro correspondente
    renderCategory({ kind: 'history' })
    await waitFor(() => expect(gridTitles()).toEqual(['Filme A']))
    expect(screen.getByText('1 filme assistido não está mais nesta lista.')).toBeInTheDocument()
  })

  it('sem "Ordenar" dentro de "↺ Histórico" (FR-022 — ordem própria, mais recente primeiro)', async () => {
    await seedMovie('Filme A', 'a')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100)
    renderCategory({ kind: 'history' })
    await waitFor(() => expect(gridTitles()).toEqual(['Filme A']))
    expect(document.querySelector('[class*="sort"]')).toBeNull()
    expect(screen.queryByText('Ordenar')).not.toBeInTheDocument()
  })

  it('OK abre o detalhe com o estado de volta; devolvido ao remontar, restaura o card (por id)', async () => {
    await seedMovie('Filme A', 'a')
    const idB = await seedMovie('Filme B', 'b')
    await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 100)
    await updateProgress(`${SOURCE_ID}|movie|id:b`, SOURCE_ID, 200)

    const onOpenItem = vi.fn()
    renderCategory({ kind: 'history' }, { onOpenItem })
    await waitFor(() => expect(gridTitles()).toEqual(['Filme B', 'Filme A']))

    press('Enter')
    // `press` não dispara `keyup`; OK real precisa do gesto completo (feature 013).
    act(() => document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })))

    expect(onOpenItem).toHaveBeenCalledTimes(1)
    const [openedId, restore] = onOpenItem.mock.calls[0] as [string, VodCategoryRestore]
    expect(openedId).toBe(String(idB))
    expect(restore).toMatchObject({ focusedItemId: String(idB), searchActive: false })

    cleanup()
    renderCategory({ kind: 'history' }, { restore })
    await waitFor(() => expect(gridTitles().length).toBeGreaterThan(0))
    expect(focusedTitle()).toBe('Filme B')
  })
})

describe('VodCategoryScreen — Ordenar (feature 025, US4, T050)', () => {
  /** Sobe da grade até o botão "Ordenar" (Pesquisar → Ordenar) e abre o modal. */
  function openSortFromGrid() {
    press('ArrowUp') // 1ª linha da grade -> "Pesquisar"
    press('ArrowRight') // "Pesquisar" -> "Ordenar"
    press('Enter') // abre o modal
  }

  function sortModalLabels(): string[] {
    return [...document.querySelectorAll('.vod-sort-modal-item')].map((el) => el.textContent ?? '')
  }

  it('só oferece opções com dado real na entrada; escolher "Ano" reordena e itens sem ano vão ao fim', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a', 2001), movie('Filme B', 'b'), movie('Filme C', 'c', 2020)] })
    renderCategory()
    openSortFromGrid()

    // Sem `added_at` em nenhum item: "Recém-adicionados" não aparece. "✓" marca a opção atual.
    expect(sortModalLabels()).toEqual(['✓ Ordem da fonte', 'A–Z', 'Ano'])
    press('ArrowDown') // "A–Z"
    press('ArrowDown') // "Ano"
    press('Enter') // escolhe

    expect(document.querySelector('.vod-toolbar-sort-button')?.textContent).toBe('Ordenar · Ano ▾')
    expect(gridTitles()).toEqual(['Filme C', 'Filme A', 'Filme B']) // mais novo primeiro; sem ano no fim
  })

  // Feature 039, T033: "Todos" aos poucos só tem parte do tipo lida — "Ano" vem do tipo inteiro.
  it('"Todos" aos poucos: o modal oferece "Ano" mesmo se só uma categoria ainda não lida declara ano', async () => {
    const [categoryId] = await storeCategories([
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Lá embaixo', order: 9, providerCategoryId: '9' },
    ])
    await renewCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 9 },
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: 'Com ano', originalName: 'Com ano', groupOrder: 9, providerStreamId: 'y', year: 1999 }],
      1,
    )
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
      items: [movie('Filme A', 'a'), movie('Filme B', 'b')], // sem ano: só a 1ª página lida
      coveredCategories: 1,
      totalCategories: 2,
      isLoading: false,
      hasMore: true,
      loadMore: vi.fn(),
    })
    renderCategory({ kind: 'all' })
    openSortFromGrid()

    await waitFor(() => expect(sortModalLabels()).toEqual(['✓ Ordem da fonte', 'A–Z', 'Ano']))
    await db.categoryBlocks.delete(categoryId)
    await db.categories.delete(categoryId)
  })

  it('"Ver tudo" de Adicionados abre "Todos" já em Recém-adicionados, só nesta abertura (não grava a sessão)', () => {
    mockAggregated([movie('Filme A', 'a', 2001, 10), movie('Filme B', 'b', 2020, 30), movie('Filme C', 'c', 2010, 20)])
    const first = renderCategory({ kind: 'all', sort: 'added' })
    expect(document.querySelector('.vod-toolbar-sort-button')?.textContent).toBe('Ordenar · Recém-adicionados ▾')
    expect(gridTitles()).toEqual(['Filme B', 'Filme C', 'Filme A'])
    first.unmount()

    renderCategory({ kind: 'all' }) // sem `sort`: volta à ordem da fonte
    expect(document.querySelector('.vod-toolbar-sort-button')?.textContent).toBe('Ordenar · Ordem da fonte ▾')
  })

  it('o foco segue o mesmo item (por identidade) depois de reordenar, e a memória o devolve ao remontar', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a', 2001), movie('Filme B', 'b', 2020)] })
    const first = renderCategory()
    // Estabelece o foco por IDENTIDADE em "Filme A" (ida e volta) — sem isso `focusedItemId` continua `null`.
    press('ArrowRight')
    press('ArrowLeft')
    openSortFromGrid()
    press('ArrowDown') // "A–Z"
    press('ArrowDown') // "Ano"
    press('Enter') // escolhe — o foco (de estado) volta ao botão "Ordenar", nunca à grade (FR-018)

    expect(gridTitles()).toEqual(['Filme B', 'Filme A']) // "Filme A" (2001) foi para a 2ª posição
    expect(document.querySelector('.vod-toolbar-sort-button')).toHaveClass('tv-focus')

    first.unmount()
    renderCategory() // a MESMA categoria: o item lembrado (por identidade) sobrevive, agora na 2ª posição (FR-024)
    expect(focusedTitle()).toBe('Filme A')
  })

  it('a ordenação escolhida vale para outra categoria da mesma seção e sobrevive a desmontar/remontar', () => {
    mockCategories([category(1, 'Ação', 0), category(2, 'Drama', 1)])
    mockContentByCategory({
      1: [movie('Filme A', 'a', 2001), movie('Filme B', 'b', 2020)],
      2: [movie('Filme D', 'd', 1999), movie('Filme E', 'e', 2015)],
    })
    const first = renderCategory()
    openSortFromGrid()
    press('ArrowDown') // "A–Z"
    press('ArrowDown') // "Ano"
    press('Enter')
    expect(gridTitles()).toEqual(['Filme B', 'Filme A'])
    first.unmount()

    const drama = renderCategory({ kind: 'category', name: 'Drama' }) // mesma seção, mesma ordenação
    expect(gridTitles()).toEqual(['Filme E', 'Filme D'])
    drama.unmount()

    renderCategory() // "Ação" de novo
    expect(gridTitles()).toEqual(['Filme B', 'Filme A'])
  })

  it('RETURN no modal fecha sem mudar nada, e o foco volta ao botão "Ordenar"', () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a', 2001), movie('Filme B', 'b', 2020)] })
    renderCategory()
    openSortFromGrid()
    press('ArrowDown') // foca "Ano", sem escolher
    press('Escape') // RETURN no modal

    expect(document.querySelector('.modal-overlay')).toBeNull()
    expect(document.querySelector('.vod-toolbar-sort-button')?.textContent).toBe('Ordenar · Ordem da fonte ▾')
    expect(document.querySelector('.vod-toolbar-sort-button')).toHaveClass('tv-focus')
    expect(gridTitles()).toEqual(['Filme A', 'Filme B']) // ordem da fonte, inalterada
  })

  it('nunca oferece "Ordenar" em "★ Favoritos" nem em "↺ Histórico" (FR-022)', async () => {
    await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Filme Favorito',
      originalName: 'Filme Favorito',
      groupOrder: 0,
      providerStreamId: 'fav1',
    })
    await db.userStates.put({
      stableId: `${SOURCE_ID}|movie|id:fav1`,
      sourceId: SOURCE_ID,
      isFavorite: true,
      favoritedAt: 100,
      createdAt: 100,
      updatedAt: 100,
    })
    await updateProgress(`${SOURCE_ID}|movie|id:fav1`, SOURCE_ID, 30)

    const favorites = renderCategory({ kind: 'favorites' })
    await waitFor(() => expect(gridTitles()).toEqual(['Filme Favorito']))
    expect(document.querySelector('.vod-toolbar-sort-button')).toBeNull()
    favorites.unmount()

    renderCategory({ kind: 'history' })
    await waitFor(() => expect(gridTitles()).toEqual(['Filme Favorito']))
    expect(document.querySelector('.vod-toolbar-sort-button')).toBeNull()
  })

  it('busca e ordenação ativas juntas: o resultado filtrado aparece na ordem escolhida (FR-023)', async () => {
    mockContentByCategory({
      1: [movie('Filme Alfa', 'a', 2001), movie('Filme Beta', 'b', 2020), movie('Filme Gama', 'c', 2010)],
    })
    renderCategory()
    openSortFromGrid()
    press('ArrowDown') // "A–Z"
    press('ArrowDown') // "Ano"
    press('Enter')
    expect(gridTitles()).toEqual(['Filme Beta', 'Filme Gama', 'Filme Alfa'])

    press('ArrowLeft') // "Ordenar" -> "Pesquisar"
    press('Enter') // abre o campo
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field!, { target: { value: 'filme' } }))
    // Os três têm "filme" no nome — o resultado (idêntico à base) segue "Ano".
    await waitFor(() => expect(gridTitles()).toEqual(['Filme Beta', 'Filme Gama', 'Filme Alfa']))
  })

  it('busca sem resultado: estado vazio, campo mantém foco e RETURN fecha a busca (depois sai) sem prender o controle', async () => {
    mockContentByCategory({ 1: [movie('Filme A', 'a')] })
    const { onBack } = renderCategory()
    press('ArrowUp')
    press('Enter') // abre a busca
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field!, { target: { value: 'zzzzz' } }))
    expect(await screen.findByText(/Nenhum resultado para "zzzzz"/)).toBeInTheDocument()
    press('Escape') // fecha a busca
    expect(document.querySelector('input.search-field')).toBeNull()
    expect(onBack).not.toHaveBeenCalled()
    press('Escape') // sem busca: volta à vitrine
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('VodCategoryScreen — initialTopbarItem (feature 026, FR-034/FR-044)', () => {
  it('sem initialTopbarItem, começa com o foco no conteúdo (comportamento de sempre)', () => {
    renderCategory(ACAO, { withShell: true })
    expect(document.querySelectorAll('.topbar .tv-focus')).toHaveLength(0)
  })

  it('com initialTopbarItem, remonta com a topbar já ativa nesse item (volta de Busca/Configurações)', () => {
    // Ad-hoc 2026-10-09: a lupa está escondida; a volta de Configurações é o caso que sobra.
    renderCategory(ACAO, { withShell: true, initialTopbarItem: 'settings' })
    expect(screen.getByRole('button', { name: 'Configurações' })).toHaveClass('tv-focus')
  })
})

describe('VodCategoryScreen — selo da nota do provedor (feature 055)', () => {
  const withRating = (item: CatalogItemOut, rating: number | null): CatalogItemOut => ({ ...item, provider_rating: rating })

  // FR-005, FR-003, US1/AC1+AC3
  it('card com nota válida mostra "★ 7,4"; sem nota, 0 ou ausente não mostra selo nenhum', async () => {
    mockContentByCategory({
      1: [
        withRating(movie('Filme A', 'a'), 7.4),
        withRating(movie('Filme B', 'b'), 0),
        withRating(movie('Filme C', 'c'), null),
        movie('Filme D', 'd'),
      ],
    })
    renderCategory()
    await waitFor(() => expect(gridTitles()).toHaveLength(4))

    const badges = [...document.querySelectorAll('.vod-grid .rating-badge')].map((el) => el.textContent)
    expect(badges).toEqual(['★ 7,4'])
    expect(document.querySelector('.vod-grid')).not.toHaveTextContent(/Provedor|sem nota/i)
  })

  // FR-009, US1/AC4: o selo não é focável e a ordem de foco é a de antes
  it('o selo não entra na ordem de foco: a navegação continua passando card a card', async () => {
    mockContentByCategory({ 1: [withRating(movie('Filme A', 'a'), 8), movie('Filme B', 'b')] })
    renderCategory()
    await waitFor(() => expect(gridTitles()).toHaveLength(2))

    expect(document.querySelector('.rating-badge')?.closest('[tabindex], button, a')).toBeNull()
    const first = focusedTitle()
    press('ArrowRight')
    expect(focusedTitle()).not.toBe(first)
  })

  // FR-004: uma casa decimal e vírgula no idioma padrão (pt)
  it('nota 9.2 sai como "★ 9,2" dentro do card', async () => {
    const item = withRating(movie('Filme A', 'a'), 9.2)
    mockContentByCategory({ 1: [item] })
    renderCategory()
    await waitFor(() => expect(gridTitles()).toEqual(['Filme A']))
    expect(document.querySelector('.vod-grid-cell .rating-badge')).toHaveTextContent('★ 9,2')
  })
});

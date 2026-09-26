/**
 * Testes de CONTRATO da feature 018 (busca por categoria) — travados em
 * `sdd/specs/018-busca-por-categoria/contract-tests.lock`. O sdd-execute só
 * pode fazê-los passar, nunca editá-los.
 *
 * Seletores fixados por este contrato (fonte de verdade — `logic/busca-
 * por-categoria.md` não repete isto em prosa):
 * - `.search-icon-button`: botão do ícone de busca, no topo da coluna de
 *   conteúdo, ao lado do título da entrada atual.
 * - `.search-field` (já existente, feature 017): campo de texto, visível
 *   só com a busca ativa.
 * - `.live-item-all`: entrada "Todos" na trilha (mesmo padrão de
 *   `.live-item-favorites`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryFetchOutcome } from '../catalog/catalogApi'

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
  }
})

function category(id: number, name: string, order: number): CatalogCategory {
  return { id, kind: 'channel', name, order, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

function channel(name: string, group: string | null): CatalogItemOut {
  return { id: `id-${name}`, kind: 'channel', name, original_group: group, published: true, playable: true }
}

function mockCategories(categories: CatalogCategory[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
}

function mockContentByCategory(byId: Record<number, CatalogItemOut[]>, outcome: CategoryFetchOutcome = 'fresh') {
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? (byId[cat.id] ?? []) : []
    return {
      data: { items, totalCount: items.length, outcome },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
}

function mockAggregated(items: CatalogItemOut[], coveredCategories: number, totalCategories: number) {
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items,
    coveredCategories,
    totalCategories,
    isLoading: false,
  })
}

function renderLive() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  function buildUi() {
    return (
      <Wrapper>
        <LiveScreen sourceId="source-1" onBack={vi.fn()} onResync={vi.fn()} />
      </Wrapper>
    )
  }
  return render(buildUi())
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    if (key === 'Enter') document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

describe('LiveScreen — busca por categoria (contrato, feature 018)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // US1 AC1-3, FR-006: buscar dentro de uma categoria real nunca cruza para outra.
  it('buscar dentro de uma categoria acha só itens dela, nunca de outra categoria', () => {
    mockCategories([category(1, 'Esportes', 0), category(2, 'Notícias', 1)])
    mockContentByCategory({
      1: [channel('Globo Esportes', 'Esportes'), channel('ESPN', 'Esportes')],
      2: [channel('Globo Notícias', 'Notícias')],
    })
    mockAggregated([], 0, 2)
    renderLive()

    press('ArrowRight') // entra em "Esportes" (padrão: 1ª categoria real)
    press('ArrowUp') // sobe do 1º item para o ícone de busca
    press('Enter') // ativa o ícone: abre o campo

    const field = document.querySelector<HTMLInputElement>('input.search-field')
    expect(field).not.toBeNull()
    act(() => fireEvent.change(field!, { target: { value: 'glo' } }))

    const names = [...document.querySelectorAll('.live-item-name')].map((el) => el.textContent)
    expect(names).toEqual(['Globo Esportes'])
    expect(names).not.toContain('Globo Notícias')
  })

  // US2 AC1-4, FR-003/007/010: "Todos" lista tudo já coberto sem buscar,
  // mostra cobertura parcial, e busca dentro dela acha item de categoria coberta.
  it('"Todos" lista itens de mais de uma categoria sem buscar, mostra cobertura parcial, e busca dentro dela funciona', () => {
    mockCategories([category(1, 'Esportes', 0), category(2, 'Notícias', 1)])
    mockContentByCategory({ 1: [channel('Globo Esportes', 'Esportes'), channel('ESPN', 'Esportes')] })
    // "Notícias" nunca foi aberta — só 1 de 2 categorias cobertas.
    mockAggregated([channel('Globo Esportes', 'Esportes'), channel('ESPN', 'Esportes')], 1, 2)
    renderLive()

    press('ArrowUp') // de "Esportes" (padrão) para "Todos"
    press('ArrowRight') // entra em "Todos"

    const namesBeforeSearch = [...document.querySelectorAll('.live-item-name')].map((el) => el.textContent)
    expect(namesBeforeSearch.sort()).toEqual(['ESPN', 'Globo Esportes'].sort())
    expect(document.body.textContent).toContain('Busca em 1 de 2 categorias')

    press('ArrowUp') // do 1º item para o ícone
    press('Enter') // abre o campo
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field!, { target: { value: 'espn' } }))

    const namesAfterSearch = [...document.querySelectorAll('.live-item-name')].map((el) => el.textContent)
    expect(namesAfterSearch).toEqual(['ESPN'])
  })

  // FR-008/FR-017, caso traiçoeiro: RETURN em camadas e reset ao trocar de categoria.
  it('RETURN em camadas (resultado → campo → ícone → trilha) e trocar de categoria reseta a busca', () => {
    mockCategories([category(1, 'Esportes', 0), category(2, 'Notícias', 1)])
    mockContentByCategory({
      1: [channel('Globo Esportes', 'Esportes'), channel('ESPN', 'Esportes')],
      2: [channel('Globo Notícias', 'Notícias')],
    })
    mockAggregated([], 0, 2)
    renderLive()

    press('ArrowRight') // entra em "Esportes"
    press('ArrowUp') // ícone
    press('Enter') // abre o campo
    const field = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field!, { target: { value: 'glo' } }))
    press('ArrowDown') // do campo para o 1º resultado

    press('Escape') // RETURN no resultado -> volta ao campo
    expect(document.activeElement).toBe(field)

    press('Escape') // RETURN no campo -> fecha a busca, volta à lista normal
    expect(document.querySelector('input.search-field')).toBeNull()
    const namesAfterClose = [...document.querySelectorAll('.live-item-name')].map((el) => el.textContent)
    expect(namesAfterClose.sort()).toEqual(['ESPN', 'Globo Esportes'].sort())

    // Troca de categoria SEM fechar uma busca aberta: reabre a busca em
    // "Esportes", vai para "Notícias" direto pela trilha, volta — o termo
    // não sobrevive.
    press('ArrowUp') // 1º item -> ícone
    press('Enter') // reabre o campo
    const field2 = document.querySelector<HTMLInputElement>('input.search-field')
    act(() => fireEvent.change(field2!, { target: { value: 'glo' } }))

    press('ArrowLeft') // sai direto para a trilha, com a busca ainda aberta
    press('ArrowDown') // foco em "Notícias"
    press('ArrowRight') // entra em "Notícias"
    expect(document.querySelector('input.search-field')).toBeNull()

    press('ArrowLeft')
    press('ArrowUp') // volta para "Esportes" na trilha
    press('ArrowRight') // reentra em "Esportes"
    expect(document.querySelector('input.search-field')).toBeNull()
    const namesOnReentry = [...document.querySelectorAll('.live-item-name')].map((el) => el.textContent)
    expect(namesOnReentry.sort()).toEqual(['ESPN', 'Globo Esportes'].sort())
  })

  // D-006, Constitution "Foco Visível e Sem Becos Sem Saída": o ícone só
  // aparece quando há itens carregados.
  it('o ícone de busca só aparece quando a categoria tem itens carregados', () => {
    mockCategories([category(1, 'Esportes', 0), category(2, 'Vazia', 1)])
    mockContentByCategory({ 1: [channel('Globo Esportes', 'Esportes')], 2: [] })
    mockAggregated([], 0, 2)
    renderLive()

    press('ArrowRight') // entra em "Esportes" (com item)
    expect(document.querySelector('.search-icon-button')).not.toBeNull()

    press('ArrowLeft')
    press('ArrowDown') // foco em "Vazia"
    press('ArrowRight') // entra em "Vazia" (sem item)
    expect(document.querySelector('.search-icon-button')).toBeNull()
  })
})

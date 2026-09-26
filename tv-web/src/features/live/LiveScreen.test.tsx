import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut, CategoryFetchOutcome } from '../catalog/catalogApi'

/**
 * jsdom não faz layout de verdade nem implementa `Element.scrollTo`
 * (feature 009, painel de canais virtualizado por `@tanstack/react-virtual`).
 * Sem isto, o virtualizador mede o contêiner como 0×0 e nunca monta nenhum
 * `.live-item` — todo teste que procura `.tv-focus` no painel de canais
 * falharia por um motivo alheio ao que está sendo testado. Os valores
 * (640×400) só precisam ser "grandes o bastante" para caber os poucos
 * itens que a maioria dos testes usa; T009/T010 testam milhares de itens
 * de propósito, para exercitar a janela deslizante de verdade.
 */
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
  // `getMaxScrollOffset` do virtualizador usa `scrollHeight - clientHeight`
  // (`@tanstack/virtual-core`) para nunca deixar o alvo do `scrollToIndex`
  // passar do fim da lista. Sem mockar os dois, ambos ficam 0 no jsdom (sem
  // layout real) e todo `scrollToIndex` é grampeado em 0 — a janela nunca
  // se move, mesmo com `offsetHeight`/`scrollTo` já resolvidos acima.
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
      const top = typeof options === 'object' && options !== null ? options.top : undefined
      if (typeof top === 'number') this.scrollTop = top
      // Assíncrono de propósito: um navegador real nunca entrega o evento de
      // scroll na mesma volta de pilha da chamada a `scrollTo` — despachar
      // sincronamente aqui reentraria no React em plena fase de commit (o
      // `scrollToIndex` desta chamada roda dentro do efeito de
      // `useVirtualFocusSync`), disparando o aviso "flushSync was called
      // from inside a lifecycle method".
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
    // Sem mock, tocaria IndexedDB/rede de verdade a cada movimento de
    // cursor nestes testes — o comportamento do pré-fetch em si tem teste
    // próprio, isolado, em catalogApi.test.tsx.
    useCategoryFocusPrefetch: vi.fn(),
    fetchPlayback: vi.fn(),
    // Idem: sem mock, tocaria IndexedDB de verdade a cada entrada em "Todos".
    useAggregatedItems: vi.fn(),
  }
})

function category(
  id: number,
  name: string,
  order: number,
  overrides: Partial<CatalogCategory> = {},
): CatalogCategory {
  return {
    id,
    kind: 'channel',
    name,
    order,
    count: 0,
    fetchMode: 'on_demand',
    providerCategoryId: String(id),
    ...overrides,
  }
}

function channel(name: string, group: string | null, playable = true): CatalogItemOut {
  return { id: `id-${name}`, kind: 'channel', name, original_group: group, published: true, playable }
}

/** Estrutura: sempre disponível de cara — nunca é o que fica em "carregando" nestes testes. */
function mockCategories(categories: CatalogCategory[]) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: categories,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
}

function mockCategoriesState(state: { isLoading?: boolean; isError?: boolean }) {
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({
    data: undefined,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
}

/**
 * Conteúdo por categoria — diferente de um `mockReturnValue` fixo porque
 * vários testes precisam que categorias DIFERENTES devolvam itens
 * DIFERENTES (ex.: trocar de grupo, ou uma categoria sumir do catálogo
 * novo mas a outra continuar servindo).
 */
function mockContentByCategory(
  byId: Record<number, CatalogItemOut[]>,
  outcome: CategoryFetchOutcome = 'fresh',
) {
  const refetch = vi.fn()
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat ? (byId[cat.id] ?? []) : []
    return {
      data: { items, totalCount: items.length, outcome },
      isLoading: false,
      isError: false,
      refetch,
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  return refetch
}

/** "Todos" (feature 018) — itens agregados fixos, sem depender do banco real. */
function mockAggregated(items: CatalogItemOut[], coveredCategories = 1, totalCategories = 1) {
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
    items,
    coveredCategories,
    totalCategories,
    isLoading: false,
  })
}

function mockContentLoading() {
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
}

function renderLive(onResync: () => void = vi.fn(), onBack: () => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  // Um elemento NOVO a cada chamada é essencial: reusar a MESMA referência
  // de elemento entre `render` e `rerender` faz o React aplicar bailout por
  // identidade referencial na subárvore inteira, e `LiveScreen` nunca
  // re-executa — os mocks nunca seriam relidos de verdade.
  function buildUi() {
    return (
      <Wrapper>
        <LiveScreen sourceId="source-1" onBack={onBack} onResync={onResync} />
      </Wrapper>
    )
  }
  const result = render(buildUi())
  return { ...result, rerenderLive: () => result.rerender(buildUi()) }
}

/**
 * Simula um toque rápido no controle. Para OK (feature 013), um toque
 * rápido de verdade solta a tecla quase no mesmo instante — sem o `keyup`
 * aqui, o gesto de "segurar" (agora possível sempre que um canal está
 * focado, `LiveScreen.tsx`) nunca completaria como toque curto: o `onSelect`
 * só dispara no `keyup`, e sem ele os timers REAIS deste arquivo (nenhum
 * `vi.useFakeTimers()`) acabariam correndo até o limiar de "segurar" durante
 * um `waitFor` mais longo, disparando `onLongSelect` por engano.
 */
function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    if (key === 'Enter') {
      document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    }
  })
}

/** Entra na categoria em foco (dispara a obtenção) e desce `n` posições dentro dela. */
function enterAndDescend(n = 0) {
  press('ArrowRight')
  for (let i = 0; i < n; i += 1) press('ArrowDown')
}

describe('LiveScreen', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    mockContentByCategory({})
    mockAggregated([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // --- estados de borda, todos com saída focável ---

  it('mostra carregando com um elemento focável', () => {
    mockCategoriesState({ isLoading: true })
    const { container } = renderLive()

    expect(screen.getByText(/Carregando canais/)).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('mostra erro de carga com "Tentar de novo" focável', () => {
    mockCategoriesState({ isError: true })
    const { container } = renderLive()

    expect(screen.getByText(/Não foi possível carregar os canais/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('distingue "nenhum canal na fonte" de erro, com saída focável', () => {
    mockCategories([])
    const { container } = renderLive()

    expect(screen.getByText('Nenhum canal nesta lista')).toBeInTheDocument()
    expect(screen.queryByText(/Não foi possível carregar/)).not.toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  // --- T028: mover o foco sobre categorias não busca; SELECT/entrar busca ---

  it('mover o foco entre categorias não consulta o conteúdo — só entrar consulta (T028, FR-004)', () => {
    mockCategories([category(1, 'Esportes', 0), category(2, 'Notícias', 1)])
    renderLive()

    press('ArrowDown') // move o cursor da trilha para "Notícias" — ainda não entrou
    press('ArrowUp')

    // `useCategoryContent` é sempre chamado (é um hook), mas com categoria
    // `undefined` até a entrada — é isso que mantém a consulta desabilitada
    // (`enabled: category !== undefined`, em catalogApi.ts). Mover o cursor
    // pela trilha nunca passa uma categoria concreta para o hook.
    const calls = vi.mocked(catalogApi.useCategoryContent).mock.calls
    expect(calls.every(([, cat]) => cat === undefined)).toBe(true)

    press('ArrowRight') // agora sim: entrar passa a categoria concreta
    const callsAfterEnter = vi.mocked(catalogApi.useCategoryContent).mock.calls
    expect(callsAfterEnter.some(([, cat]) => cat?.id === 1)).toBe(true)
  })

  it('entrar na categoria (seta direita) mostra os canais dela, na ordem declarada', () => {
    mockCategories([category(1, 'Esportes', 0), category(2, 'Notícias', 1)])
    mockContentByCategory({ 1: [channel('Zulu', 'Esportes'), channel('Yankee', 'Esportes')] })
    renderLive()

    // "★ Favoritos" (feature 013) e "Todos" (feature 018) são sempre as
    // duas primeiras entradas da trilha, antes de qualquer categoria
    // declarada pela fonte.
    const groups = document.querySelectorAll('.live-column-groups .live-item')
    expect([...groups].map((g) => g.textContent)).toEqual(['★Favoritos', 'Todos', 'Esportes', 'Notícias'])

    press('ArrowRight') // padrão é focar a primeira categoria REAL — entra em "Esportes"

    const channels = document.querySelectorAll('.live-column-channels .live-item-name')
    expect([...channels].map((c) => c.textContent)).toEqual(['Zulu', 'Yankee'])
  })

  // --- T009/T010 (feature 009): painel de canais virtualizado ---

  it('categoria com milhares de canais monta só uma fração deles no DOM (T009)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => channel(`Canal ${i}`, 'Esportes'))
    mockCategories([category(1, 'Esportes', 0)])
    mockContentByCategory({ 1: many })
    renderLive()

    press('ArrowRight')

    const rendered = document.querySelectorAll('.live-column-channels .live-item-name')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(many.length)
  })

  it('mover o foco para um índice fora da janela renderizada aciona scrollToIndex e o item aparece focado (T010)', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => channel(`Canal ${i}`, 'Esportes'))
    mockCategories([category(1, 'Esportes', 0)])
    mockContentByCategory({ 1: many })
    renderLive()

    // Bem além da janela inicial (viewport de teste ~640px / linha de 84px
    // ≈ 8 itens visíveis + overscan) — só aparece com `tv-focus` se o
    // `scrollToIndex` disparado por `useVirtualFocusSync` moveu a janela.
    // O evento de scroll do polyfill acima é assíncrono (como num navegador
    // real), então a janela só se assenta depois de um microtask — daí o
    // `waitFor`.
    enterAndDescend(200)

    await waitFor(() => {
      const focused = document.querySelector('.live-column-channels .tv-focus')
      expect(focused?.textContent).toContain('Canal 200')
    })
  })

  it('não exibe contagem total nem "fim do catálogo" (FR-016)', () => {
    mockCategories([category(1, 'G', 0)])
    mockContentByCategory({ 1: [channel('A', 'G'), channel('B', 'G')] })
    renderLive()

    press('ArrowRight')

    // O catálogo publicado pode ser parcial durante uma importação; a tela
    // não pode sugerir completude.
    expect(screen.queryByText(/2 canais/)).not.toBeInTheDocument()
    expect(screen.queryByText(/fim do catálogo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument()
  })

  // --- T029: estados de carregando/erro do conteúdo, todos focáveis ---

  it('mostra carregando o conteúdo da categoria, com saída focável', () => {
    mockCategories([category(1, 'Esportes', 0)])
    mockContentLoading()
    renderLive()

    press('ArrowRight')

    expect(screen.getByText(/Carregando canais/)).toBeInTheDocument()
  })

  it('categoria que nunca falou com o painel mostra erro com "Tentar de novo" (T029)', () => {
    mockCategories([category(1, 'Esportes', 0)])
    mockContentByCategory({}, 'failed')
    renderLive()

    press('ArrowRight')

    expect(screen.getByText('Não foi possível carregar esta categoria')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('SELECT em "Tentar de novo" aciona a nova tentativa (achado corrigido junto com a feature 014)', () => {
    mockCategories([category(1, 'Esportes', 0)])
    const refetch = mockContentByCategory({}, 'failed')
    renderLive()

    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    press('Enter')

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('categoria stored sem arquivo guardado mostra "Ressincronizar lista", e SELECT aciona onResync (feature 014, D-008)', () => {
    mockCategories([category(1, 'Esportes', 0, { fetchMode: 'stored' })])
    mockContentByCategory({}, 'source_missing')
    const onResync = vi.fn()
    renderLive(onResync)

    press('ArrowRight')

    expect(screen.getByText('O conteúdo desta lista não está mais no aparelho')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ressincronizar lista' })).toBeInTheDocument()
    // "Tentar de novo" não aparece aqui — não resolveria nada (D-008).
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()

    press('Enter')
    expect(onResync).toHaveBeenCalledTimes(1)
  })

  it('categoria vencida cuja busca falhou serve o que estava salvo, com aviso (contrato §2)', () => {
    mockCategories([category(1, 'Esportes', 0)])
    mockContentByCategory({ 1: [channel('Zulu', 'Esportes')] }, 'stale-served')
    renderLive()

    press('ArrowRight')

    expect(screen.getByText(/Não foi possível atualizar agora/)).toBeInTheDocument()
    expect(document.querySelector('.live-column-channels .live-item-name')?.textContent).toBe('Zulu')
  })

  // --- canal indisponível ---

  it('mostra canal sem URL como indisponível, e Enter não abre o player', () => {
    mockCategories([category(1, 'Grupo', 0)])
    mockContentByCategory({ 1: [channel('Sem fonte', 'Grupo', false)] })
    renderLive()

    enterAndDescend()
    expect(screen.getByText('Indisponível')).toBeInTheDocument()

    press('Enter')

    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/não tem uma fonte de reprodução/)).toBeInTheDocument()
  })

  // --- foco não dispara requisição de reprodução (SC-006) ---

  it('mover o foco por toda a lista não dispara nenhuma requisição de reprodução', () => {
    mockCategories([category(1, 'G1', 0), category(2, 'G2', 1)])
    mockContentByCategory({
      1: [channel('A', 'G1'), channel('B', 'G1')],
      2: [channel('C', 'G2')],
    })
    renderLive()

    press('ArrowDown')
    press('ArrowUp')
    enterAndDescend(1)
    press('ArrowUp')
    press('ArrowLeft')
    press('ArrowDown')

    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // --- Enter repetido cria uma única sessão ---

  it('Enter repetido no mesmo canal cria uma única sessão de reprodução', async () => {
    mockCategories([category(1, 'G', 0)])
    mockContentByCategory({ 1: [channel('Canal', 'G')] })
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
      item_id: 'id-Canal',
      kind: 'channel',
      url: 'http://exemplo.invalid/x.ts',
      container_hint: 'ts',
      source_id: 'src1',
      provider_stream_id: '1',
      original_name: 'Canal',
      series_id: null,
      season_number: null,
      episode_number: null,
    })
    renderLive()

    enterAndDescend()
    press('Enter')
    press('Enter')
    press('Enter')

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(catalogApi.fetchPlayback).toHaveBeenCalledTimes(1)
  })

  // --- voltar do player restaura o foco no canal de origem ---

  it('ao fechar o player, o foco volta ao canal de origem no mesmo grupo', async () => {
    mockCategories([category(1, 'G1', 0), category(2, 'G2', 1)])
    mockContentByCategory({
      1: [channel('Primeiro', 'G1'), channel('Segundo', 'G1')],
      2: [channel('Outro', 'G2')],
    })
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
      item_id: 'id-Segundo',
      kind: 'channel',
      url: 'http://exemplo.invalid/x.ts',
      container_hint: 'ts',
      source_id: 'src1',
      provider_stream_id: '2',
      original_name: 'Segundo',
      series_id: null,
      season_number: null,
      episode_number: null,
    })
    renderLive()

    enterAndDescend(1)
    const focusedBefore = document.querySelector('.live-column-channels .tv-focus')?.textContent
    expect(focusedBefore).toContain('Segundo')

    press('Enter')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const focusedAfter = document.querySelector('.live-column-channels .tv-focus')?.textContent
    expect(focusedAfter).toContain('Segundo')
    // E o grupo continua o mesmo (título da coluna de canais, não a de grupos).
    expect(
      document.querySelector('.live-column-channels .live-column-title')?.textContent,
    ).toBe('G1')
  })

  it('trocar de grupo recomeça no primeiro canal', () => {
    mockCategories([category(1, 'G1', 0), category(2, 'G2', 1)])
    mockContentByCategory({
      1: [channel('A1', 'G1'), channel('A2', 'G1')],
      2: [channel('B1', 'G2'), channel('B2', 'G2')],
    })
    renderLive()

    enterAndDescend(1)
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('A2')

    press('ArrowLeft')
    press('ArrowDown')
    press('ArrowRight')

    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B1')
  })

  // --- Feature 004 (US5): catálogo substituído em segundo plano ---
  // não desorganiza a navegação em curso (FR-022, SC-012) ---

  it('ao trocar o catálogo em segundo plano, o foco segue o canal pelo id — não pelo índice', () => {
    mockCategories([category(1, 'G1', 0), category(2, 'G2', 1)])
    mockContentByCategory({
      1: [channel('A', 'G1'), channel('B', 'G1')],
      2: [channel('C', 'G2')],
    })
    const { rerenderLive } = renderLive()

    enterAndDescend(1) // foca "B", índice 1 do grupo G1
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B')

    // Atualização por idade conclui enquanto o usuário navega: mesmos
    // canais, ordem diferente — "B" passa a ser o índice 0. Foco por
    // índice "saltaria" pra outro canal; por identidade, continua em "B".
    mockContentByCategory({
      1: [channel('B', 'G1'), channel('A', 'G1')],
      2: [channel('C', 'G2')],
    })
    rerenderLive()

    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B')
  })

  it('se o canal focado sumir do catálogo novo, cai no início do grupo em vez de focar algo aleatório', () => {
    mockCategories([category(1, 'G1', 0), category(2, 'G2', 1)])
    mockContentByCategory({
      1: [channel('A', 'G1'), channel('B', 'G1')],
      2: [channel('C', 'G2')],
    })
    const { rerenderLive } = renderLive()

    enterAndDescend(1) // foca "B"
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B')

    // "B" não existe mais no catálogo novo.
    mockContentByCategory({ 1: [channel('A', 'G1')], 2: [channel('C', 'G2')] })
    rerenderLive()

    const focused = document.querySelector('.live-column-channels .tv-focus')
    expect(focused).not.toBeNull() // continua havendo saída focável
    expect(focused?.textContent).toContain('A')
  })

  // --- T036: divergência entre o declarado e o entregue (FR-015) ---

  it('declara quando a categoria entrega menos itens do que o provedor declarou', () => {
    mockCategories([category(1, 'Esportes', 0, { declaredCount: 5 })])
    mockContentByCategory({ 1: [channel('Zulu', 'Esportes')] })
    renderLive()

    press('ArrowRight')

    expect(screen.getByText('O provedor declarou 5 canais nesta categoria, mas entregou 1.')).toBeInTheDocument()
  })

  it('não declara divergência quando não há o que comparar (fonte não declarou nada)', () => {
    mockCategories([category(1, 'Esportes', 0)]) // declaredCount ausente
    mockContentByCategory({ 1: [channel('Zulu', 'Esportes')] })
    renderLive()

    press('ArrowRight')

    expect(screen.queryByText(/O provedor declarou/)).not.toBeInTheDocument()
  })

  // --- T037: revalidar uma categoria reconcilia o foco por id, não por
  // índice (FR-019; R-004; constitution, "Voltar Restaura Foco e Posição")

  it('categoria revalidada com os itens em outra ordem mantém o foco no mesmo item por id', () => {
    mockCategories([category(1, 'Esportes', 0)])
    mockContentByCategory({ 1: [channel('Zulu', 'Esportes'), channel('Yankee', 'Esportes')] })
    const { rerenderLive } = renderLive()

    enterAndDescend(1) // foca "Yankee", índice 1
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('Yankee')

    // A categoria vence o prazo e é revalidada em segundo plano: mesmos
    // canais, ordem diferente devolvida pelo painel. Foco por índice
    // "saltaria" para outro canal; por identidade, continua em "Yankee".
    mockContentByCategory({ 1: [channel('Yankee', 'Esportes'), channel('Zulu', 'Esportes')] }, 'fetched')
    rerenderLive()

    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('Yankee')
  })

  it('se o grupo focado sumir do catálogo novo, cai no primeiro grupo', () => {
    mockCategories([category(1, 'G1', 0), category(2, 'G2', 1)])
    const { rerenderLive } = renderLive()

    press('ArrowDown') // move o cursor da trilha pro grupo G2 — sem entrar
    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('G2')

    // G2 deixou de existir.
    mockCategories([category(1, 'G1', 0), category(3, 'G3', 1)])
    rerenderLive()

    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('G1')
  })

  describe('suporte a zapping (feature 016, US1)', () => {
    beforeEach(() => {
      // Mock global para esta suíte para resolver imediatamente, simulando canal Live de sucesso.
      vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
        item_id: 'id-mock',
        kind: 'channel',
        url: 'http://live.test/stream.m3u8',
        container_hint: null,
        source_id: 'source-1',
        provider_stream_id: null,
        original_name: 'mock',
        series_id: null,
        season_number: null,
        episode_number: null,
      })
    })

    it('T020: onIdleSelect abre o zapping com foco no canal tocando, na categoria correta', async () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('C10', 'Esportes')] })
      renderLive()

      // Vai pra Esportes e Canal 10, toca
      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      // Enter abre o zapping (onIdleSelect do PlayerLayer real)
      press('Enter')
      
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())
      
      // O foco da trilha voltou pra Esportes
      expect(document.querySelector('.live-column-channels .live-column-title')?.textContent).toBe('Esportes')
      // E a coluna 1 está em foco, no canal 10
      expect(document.querySelector('.live-channel-list .tv-focus')?.textContent).toContain('C10')
    })

    it('T021: selecionar outro canal dentro do zapping chama setPlaying e mantém topLayer até onEnteredPlaying', async () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('C10', 'Esportes'), channel('C11', 'Esportes')] })
      renderLive()

      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      press('Enter') // Abre o zap
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())
      press('ArrowDown') // Foco em C11
      
      // Interrompemos o mock fetchPlayback para controlar quando ele resolve, assim testamos o estado ANTES do onEnteredPlaying
      let resolvePlayback!: (v: any) => void
      vi.mocked(catalogApi.fetchPlayback).mockImplementationOnce(() => new Promise((r) => { resolvePlayback = r }))
      
      press('Enter') // Seleciona C11

      // O topLayer continua aberto!
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())

      // Agora o playback resolve e a sessão notifica onEnteredPlaying
      act(() => resolvePlayback({
        item_id: 'id-C11',
        kind: 'channel',
        url: 'http://test',
        container_hint: null,
        source_id: 'source-1',
        provider_stream_id: null,
        original_name: 'C11',
        series_id: null,
        season_number: null,
        episode_number: null,
      }))
      await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument())
      act(() => { fireEvent.playing(document.querySelector('video')!) })
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).not.toBeInTheDocument())
    })

    it('T022: selecionar o mesmo canal que já está tocando fecha o zapping sem chamar setPlaying de novo', async () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('C10', 'Esportes')] })
      renderLive()

      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      press('Enter') // Abre o zap
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())
      
      // Limpa os mocks para ver se fetchPlayback será chamado de novo
      vi.mocked(catalogApi.fetchPlayback).mockClear()

      // Seleciona C10 de novo (já está tocando)
      press('Enter')

      // O topLayer fecha imediatamente
      expect(document.querySelector('.player-zap-columns')).not.toBeInTheDocument()
      // E não chamou setPlaying (o que dispararia novo fetchPlayback)
      expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
    })

    it('T023: RETURN com o zapping aberto fecha só ele, sem fechar a tela', async () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('C10', 'Esportes')] })
      const onBack = vi.fn()
      renderLive(undefined, onBack)

      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      press('Enter') // Abre o zap
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())
      press('Escape') // Back

      expect(document.querySelector('.player-zap-columns')).not.toBeInTheDocument()
      // Mas o player continua aberto
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(onBack).not.toHaveBeenCalled()
    })

    it('T024: trocar de categoria dentro do zapping navega normalmente', async () => {
      mockCategories([category(1, 'G1', 0), category(2, 'G2', 1)])
      mockContentByCategory({ 1: [channel('C10', 'G1')], 2: [channel('C20', 'G2')] })
      renderLive()

      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      press('Enter') // Abre o zap
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())

      press('ArrowLeft')
      // Agora o player-zap-columns contém as colunas renderizadas. 
      // Como PlayerLayer repassa onDirection para o topLayer, as teclas navegam a lista do zap.
      const zapColumns = document.querySelector('.player-zap-columns')!
      expect(zapColumns.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('G1')
      
      press('ArrowDown')
      press('ArrowRight')
      
      expect(zapColumns.querySelector('.live-column-channels .live-column-title')?.textContent).toBe('G2')
      expect(zapColumns.querySelector('.live-channel-list .tv-focus')?.textContent).toContain('C20')
    })

    it('T025: selecionar um canal e depois outro antes do onEnteredPlaying substitui a seleção sem fechar zap', async () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('C10', 'Esportes'), channel('C11', 'Esportes'), channel('C12', 'Esportes')] })
      renderLive()

      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      press('Enter') // Abre o zap
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())

      // Controlar promises — a primeira (C11) nunca resolve, provando que a
      // troca pra C12 a descarta em vez de encadear (FR-009/SC-003).
      let resolvePlayback2!: (v: any) => void
      vi.mocked(catalogApi.fetchPlayback).mockImplementationOnce(() => new Promise(() => {}))
      vi.mocked(catalogApi.fetchPlayback).mockImplementationOnce(() => new Promise((r) => { resolvePlayback2 = r }))

      // Vai pro C11 e seleciona
      press('ArrowDown')
      press('Enter')
      
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument()) // continua aberto

      // Vai pro C12 e seleciona
      press('ArrowDown')
      press('Enter')
      
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument()) // continua aberto

      // Agora resolvemos a promise do C12 (a segunda)
      act(() => resolvePlayback2({
        item_id: 'id-C12',
        kind: 'channel',
        url: 'http://test2',
        container_hint: null,
        source_id: 'source-1',
        provider_stream_id: null,
        original_name: 'C12',
        series_id: null,
        season_number: null,
        episode_number: null,
      }))
      await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument())
      act(() => { fireEvent.playing(document.querySelector('video')!) })
      
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).not.toBeInTheDocument())
    })

    it('T027: erro na troca de canal reverte para o anterior e mostra aviso (US2)', async () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('C10', 'Esportes'), channel('C11', 'Esportes')] })
      renderLive()

      // Toca C10
      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      // Abre Zapping
      press('Enter')
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())

      // Interrompe fetchPlayback
      let rejectPlayback!: (reason?: any) => void
      vi.mocked(catalogApi.fetchPlayback).mockImplementationOnce(() => new Promise((_, r) => { rejectPlayback = r }))

      // Seleciona C11
      press('ArrowDown')
      press('Enter')

      // O zap continua aberto esperando resolver
      expect(document.querySelector('.player-zap-columns')).toBeInTheDocument()

      // A promessa rejeita (simulando erro na rede ou no playback)
      act(() => rejectPlayback(new Error('Network error')))

      // Toast aparece
      await waitFor(() => expect(screen.getByText('Não foi possível trocar de canal. Voltando para C10.')).toBeInTheDocument())

      // Zapping continua aberto (para tentar de novo)
      expect(document.querySelector('.player-zap-columns')).toBeInTheDocument()

      // A sessão voltou para o C10 (isso acionaria novo fetchPlayback, que aqui será o mock default do beforeEach)
      // Como não temos como checar o state do PlayerService diretamente, verificamos que a tela de erro nativa NÃO apareceu
      await waitFor(() => expect(screen.queryByText('Não foi possível reproduzir este canal.')).not.toBeInTheDocument())
    })

    it('T028: erro na abertura normal do player exibe tela de erro nativa, sem reversão (US2)', async () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('C10', 'Esportes')] })
      
      // Dessa vez, o fetch falha desde o início (entrada normal)
      vi.mocked(catalogApi.fetchPlayback).mockRejectedValue(new Error('Fatal error'))
      renderLive()

      // Toca C10
      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      // A tela de erro nativa DEVE aparecer (pois não há zapping ativo nem lastGoodChannelRef)
      await waitFor(() => expect(screen.getByText('Não foi possível reproduzir este canal.')).toBeInTheDocument())
      
      // Toast de zapping não aparece
      expect(screen.queryByText(/Voltando para/)).not.toBeInTheDocument()
    })

    it('T015 (018): a trilha do zapping tem "Todos" (navegável), mas nunca o ícone de busca; o foco inicial continua no canal tocando', async () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('C10', 'Esportes')] })
      renderLive()

      press('ArrowRight')
      press('Enter')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      press('Enter') // abre o zapping
      await waitFor(() => expect(document.querySelector('.player-zap-columns')).toBeInTheDocument())

      const zapGroups = document.querySelectorAll('.player-zap-columns .live-column-groups .live-item')
      const zapGroupLabels = [...zapGroups].map((g) => g.textContent)
      expect(zapGroupLabels).toEqual(['★Favoritos', 'Todos', 'Esportes'])
      // FR-018: o ícone de busca nunca aparece dentro do zapping.
      expect(document.querySelector('.player-zap-columns .search-icon-button')).toBeNull()

      expect(document.querySelector('.player-zap-columns .live-channel-list .tv-focus')?.textContent).toContain(
        'C10',
      )
    })
  })

  describe('busca por categoria (feature 018)', () => {
    it('RETURN em camadas: resultado → campo → ícone → trilha; termo intacto ao voltar ao campo; reentrar começa vazia', () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('Globo', 'Esportes'), channel('ESPN', 'Esportes')] })
      renderLive()

      press('ArrowRight') // entra em "Esportes"
      press('ArrowUp') // 1º item -> ícone
      press('Enter') // abre o campo

      const field = document.querySelector<HTMLInputElement>('input.search-field')
      expect(field).not.toBeNull()
      expect(document.activeElement).toBe(field)

      act(() => fireEvent.change(field!, { target: { value: 'glo' } }))
      act(() => fireEvent.keyDown(field!, { key: 'ArrowDown', bubbles: true }))

      expect(document.querySelector('.live-channel-list .tv-focus')?.textContent).toContain('Globo')
      expect(document.activeElement).not.toBe(field)

      // RETURN com um resultado focado — volta ao campo, termo intacto.
      press('Escape')
      expect(document.activeElement).toBe(field)
      expect(field!.value).toBe('glo')

      // RETURN no campo — fecha a busca, volta a mostrar a lista normal (sem sair da categoria).
      act(() => fireEvent.keyDown(field!, { keyCode: 10009, bubbles: true }))
      expect(document.querySelector('input.search-field')).toBeNull()
      expect(document.querySelector('.search-icon-button.tv-focus')).not.toBeNull()

      // Reabrir a busca (ícone) começa vazia (FR-008), mesmo já tendo sido usada antes.
      press('Enter')
      const fieldAgain = document.querySelector<HTMLInputElement>('input.search-field')
      expect(fieldAgain!.value).toBe('')
    })

    it('tecla "Done" do teclado do sistema (keyCode 65376) no campo leva ao 1º resultado', () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('Globo', 'Esportes'), channel('TV Globo', 'Esportes')] })
      renderLive()

      press('ArrowRight')
      press('ArrowUp')
      press('Enter')

      const field = document.querySelector<HTMLInputElement>('input.search-field')
      act(() => fireEvent.change(field!, { target: { value: 'glo' } }))
      act(() => fireEvent.keyDown(field!, { keyCode: 65376, bubbles: true }))

      expect(document.activeElement).not.toBe(field)
      expect(document.querySelector('.live-channel-list .tv-focus')?.textContent).toContain('Globo')
    })

    it('busca dentro de uma categoria nunca cruza para outra categoria', () => {
      mockCategories([category(1, 'Esportes', 0), category(2, 'Notícias', 1)])
      mockContentByCategory({
        1: [channel('Globo Esportes', 'Esportes')],
        2: [channel('Globo Notícias', 'Notícias')],
      })
      renderLive()

      press('ArrowRight') // entra em "Esportes"
      press('ArrowUp')
      press('Enter')

      const field = document.querySelector<HTMLInputElement>('input.search-field')
      act(() => fireEvent.change(field!, { target: { value: 'glo' } }))

      const names = [...document.querySelectorAll('.live-item-name')].map((el) => el.textContent)
      expect(names).toEqual(['Globo Esportes'])
    })

    it('dentro de "Todos": mostra a categoria de cada resultado, a contagem e o aviso de cobertura parcial', () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockAggregated([channel('Globo', 'Esportes')], 1, 3)
      renderLive()

      press('ArrowUp') // de "Esportes" (padrão) para "Todos"
      press('ArrowRight') // entra em "Todos"
      press('ArrowUp') // 1º item -> ícone
      press('Enter') // abre o campo

      const field = document.querySelector<HTMLInputElement>('input.search-field')
      act(() => fireEvent.change(field!, { target: { value: 'glo' } }))

      expect(document.querySelector('.live-channel-list .live-item-group')?.textContent).toBe('Esportes')
      expect(screen.getByText('1 resultado')).toBeInTheDocument()
      expect(screen.getByText('Busca em 1 de 3 categorias')).toBeInTheDocument()
    })

    it('dentro de "Todos": cobertura total não mostra o aviso, nem antes nem durante a busca', () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockAggregated([channel('Globo', 'Esportes')], 1, 1)
      renderLive()

      press('ArrowUp')
      press('ArrowRight') // entra em "Todos"
      expect(document.querySelector('.live-channel-list')?.textContent).toContain('Globo')
      expect(screen.queryByText(/Busca em \d+ de \d+ categorias/)).not.toBeInTheDocument()

      press('ArrowUp')
      press('Enter')
      const field = document.querySelector<HTMLInputElement>('input.search-field')
      act(() => fireEvent.change(field!, { target: { value: 'glo' } }))

      expect(document.querySelector('.live-channel-list')?.textContent).toContain('Globo')
      expect(screen.queryByText(/Busca em \d+ de \d+ categorias/)).not.toBeInTheDocument()
    })

    it('sem resultado mostra estado vazio, distinto de "grupo vazio", sem prender o controle', () => {
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('Globo', 'Esportes')] })
      renderLive()

      press('ArrowRight')
      press('ArrowUp')
      press('Enter')

      const field = document.querySelector<HTMLInputElement>('input.search-field')
      act(() => fireEvent.change(field!, { target: { value: 'xyz' } }))

      expect(screen.getByText('Nenhum resultado para "xyz"')).toBeInTheDocument()
      expect(screen.queryByText('Este grupo está vazio.')).not.toBeInTheDocument()
      // O campo continua com foco DOM real — nenhum beco sem saída
      // (constitution): RETURN sempre sai, sem depender de um botão extra.
      expect(document.activeElement).toBe(field)
      act(() => fireEvent.keyDown(field!, { keyCode: 10009, bubbles: true }))
      expect(document.querySelector('.search-icon-button.tv-focus')).not.toBeNull()
    })

    it('o ícone de busca só aparece quando a categoria tem itens carregados', () => {
      mockCategories([category(1, 'Esportes', 0), category(2, 'Vazia', 1)])
      mockContentByCategory({ 1: [channel('Globo', 'Esportes')], 2: [] })
      renderLive()

      press('ArrowRight') // entra em "Esportes" (com item)
      expect(document.querySelector('.search-icon-button')).not.toBeNull()

      press('ArrowLeft')
      press('ArrowDown')
      press('ArrowRight') // entra em "Vazia" (sem item)
      expect(document.querySelector('.search-icon-button')).toBeNull()
    })

    it('o ícone de busca não aparece com itens obsoletos quando o conteúdo está indisponível', () => {
      // `loadCategoryContent` sempre lê `channels`, que pode reter registros
      // de uma geração anterior mesmo com outcome `source_missing`/`failed`
      // (achado no gate final desta feature) — o ícone não pode se guiar só
      // por `baseItems.length`, tem que respeitar `contentUnavailable` como
      // o resto da tela já faz.
      mockCategories([category(1, 'Esportes', 0)])
      mockContentByCategory({ 1: [channel('Globo', 'Esportes')] }, 'source_missing')
      renderLive()

      press('ArrowRight') // entra em "Esportes" — item obsoleto, outcome indisponível
      expect(document.querySelector('.search-icon-button')).toBeNull()
    })
  })
})

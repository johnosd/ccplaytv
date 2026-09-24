/**
 * Cenários de favoritos (feature 013) na Live TV — arquivo separado de
 * `LiveScreen.test.tsx` de propósito: aquele mocka `useCategoryList`/
 * `useCategoryContent` e usa a implementação REAL de `useFavoriteIds`/
 * `useFavoritesContent`/`useToggleFavorite` (contra `fake-indexeddb`),
 * este faz o oposto — mocka a estrutura/conteúdo de categoria (não é o
 * foco aqui) e deixa a camada de favoritos rodar de verdade, ponta a
 * ponta, igual a `catalogApi.test.tsx`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import * as catalogRepository from '../../lib/catalog/catalogRepository'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { FAVORITE_COLOR_KEY } from '../../lib/tizenColorKey'

// Mesmo motivo de LiveScreen.test.tsx: jsdom não faz layout real, o painel
// de canais é virtualizado (feature 009).
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
    // useFavoriteIds / useFavoritesContent / useToggleFavorite: NÃO
    // mockados — rodam de verdade contra `db` (fake-indexeddb), é o que
    // este arquivo testa.
  }
})

const SOURCE_ID = 'source-1' // igual ao sourceId fixo que renderLive() passa pra LiveScreen

function category(id: number, name: string, order: number): CatalogCategory {
  return {
    id,
    kind: 'channel',
    name,
    order,
    count: 0,
    fetchMode: 'on_demand',
    providerCategoryId: String(id),
  }
}

/** Item como a tela o recebe (via `useCategoryContent`, mockado). */
function channel(name: string, providerStreamId: string, group = 'G1'): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'channel',
    name,
    original_group: group,
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: providerStreamId,
    original_name: name,
  }
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

/**
 * Registro REAL no catálogo — o que `resolveFavorites` precisa achar
 * quando a pessoa entra em "Favoritos". Devolve o id local (autoincremento
 * do Dexie) — nunca o `id-<nome>` fictício que os testes de categoria
 * mockada usam; é o que `toItemOut` de fato usa como `CatalogItemOut.id`.
 */
async function seedRealChannel(name: string, providerStreamId: string, groupOrder = 0): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'channel',
        name,
        originalName: name,
        groupOrder,
        providerStreamId,
      },
    ],
    { allKeys: true },
  )
  return id as number
}

async function favoriteChannel(providerStreamId: string, favoritedAt: number): Promise<void> {
  const stableId = `${SOURCE_ID}|channel|id:${providerStreamId}`
  await db.userStates.put({
    stableId,
    sourceId: SOURCE_ID,
    isFavorite: true,
    favoritedAt,
    createdAt: favoritedAt,
    updatedAt: favoritedAt,
  })
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

function renderLive() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  function buildUi() {
    return (
      <Wrapper>
        <LiveScreen sourceId={SOURCE_ID} onBack={() => {}} />
      </Wrapper>
    )
  }
  const result = render(buildUi())
  return { ...result, rerenderLive: () => result.rerender(buildUi()) }
}

function keydown(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function keyup(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

/** Toque rápido — dispara `onSelect` no keyup, como um pressionamento normal do controle. */
function tap(key: string) {
  keydown(key)
  keyup(key)
}

/**
 * Segura Enter além do limiar de `onLongSelect` (tempo REAL, não
 * `vi.useFakeTimers()`): o gesto usa `setTimeout` de verdade, e este
 * arquivo também precisa de `waitFor` pra deixar o React Query resolver —
 * misturar timers falsos com o polling real de `waitFor` trava o teste
 * (o polling usa `setTimeout`, que ficaria congelado). ~850ms por chamada
 * é o custo aceito por manter os dois mecanismos simples e confiáveis.
 */
async function holdEnter(ms = 850): Promise<void> {
  keydown('Enter')
  await act(() => new Promise((resolve) => setTimeout(resolve, ms)))
}

/** Entra na categoria em foco (dispara a obtenção) e desce `n` posições dentro dela. */
function enterAndDescend(n = 0) {
  keydown('ArrowRight')
  keyup('ArrowRight')
  for (let i = 0; i < n; i += 1) {
    keydown('ArrowDown')
    keyup('ArrowDown')
  }
}

describe('LiveScreen — favoritos (feature 013)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
    mockContentByCategory({})
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('(a) OK curto no canal continua tocando, no keyup — nenhum favorito muda', async () => {
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    mockContentByCategory({ 1: [channel('Canal', '1')] })
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
      item_id: 'id-Canal',
      kind: 'channel',
      url: 'http://exemplo.invalid/x.ts',
      container_hint: 'ts',
      source_id: SOURCE_ID,
      provider_stream_id: '1',
      original_name: 'Canal',
      series_id: null,
      season_number: null,
      episode_number: null,
    })
    renderLive()

    enterAndDescend()
    tap('Enter')

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(document.querySelector('.fav-star')).not.toBeInTheDocument()
  })

  it('(b) segurar OK favorita: mostra aviso e estrela, sem abrir o player', async () => {
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    mockContentByCategory({ 1: [channel('Canal', '1')] })
    renderLive()

    enterAndDescend()
    await holdEnter()

    expect(screen.getByText('Adicionado aos favoritos')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.fav-star')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()

    keyup('Enter') // soltar depois do gesto já resolvido não faz mais nada
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 10000)

  it('(b2) tecla amarela favorita no toque único, sem esperar soltar — mesmo resultado do segurar OK', async () => {
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    mockContentByCategory({ 1: [channel('Canal', '1')] })
    renderLive()

    enterAndDescend()
    keydown(FAVORITE_COLOR_KEY)
    keyup(FAVORITE_COLOR_KEY)

    await waitFor(() => expect(screen.getByText('Adicionado aos favoritos')).toBeInTheDocument())
    await waitFor(() => expect(document.querySelector('.fav-star')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
  })

  it('(c) segurar além do limiar alterna o favorito uma única vez', async () => {
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    mockContentByCategory({ 1: [channel('Canal', '1')] })
    renderLive()

    enterAndDescend()
    await holdEnter(1500) // segura bem além do limiar de 800ms
    keyup('Enter')

    const stableId = `${SOURCE_ID}|channel|id:1`
    expect((await db.userStates.get(stableId))?.isFavorite).toBe(true) // favoritou uma vez, não alternou de novo
  }, 10000)

  it('(d) "★ Favoritos" é a primeira entrada da trilha; segurar OK nela entra como OK comum', async () => {
    await seedSource()
    mockCategories([category(1, 'Esportes', 0)])
    renderLive()

    const groups = document.querySelectorAll('.live-column-groups .live-item')
    expect([...groups].map((g) => g.textContent)).toEqual(['★Favoritos', 'Esportes'])

    keydown('ArrowUp') // do padrão (primeira categoria real) sobe pra "★ Favoritos"
    keyup('ArrowUp')
    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('★Favoritos')

    // Segurar OK aqui (col 0, trilha) age como OK comum — no keydown, sem
    // esperar soltar, porque `onLongSelect` nunca é passado fora da coluna
    // de conteúdo (D-002).
    keydown('Enter')
    expect(
      document.querySelector('.live-column-channels .live-column-title')?.textContent,
    ).toBe('★ Favoritos')
    keyup('Enter')
  })

  it('(e) "Favoritos" lista do mais recente pro mais antigo; OK toca o canal focado', async () => {
    await seedSource()
    await seedRealChannel('Antigo', '1')
    const recenteId = await seedRealChannel('Recente', '2')
    await favoriteChannel('1', 100)
    await favoriteChannel('2', 200) // favoritado depois — deve vir primeiro
    mockCategories([category(1, 'G1', 0)])
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
      item_id: String(recenteId),
      kind: 'channel',
      url: 'http://exemplo.invalid/x.ts',
      container_hint: 'ts',
      source_id: SOURCE_ID,
      provider_stream_id: '2',
      original_name: 'Recente',
      series_id: null,
      season_number: null,
      episode_number: null,
    })
    renderLive()

    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => {
      const names = document.querySelectorAll('.live-column-channels .live-item-name')
      expect([...names].map((n) => n.textContent)).toEqual(['Recente', 'Antigo'])
    })

    tap('Enter')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(catalogApi.fetchPlayback).toHaveBeenCalledWith(String(recenteId))
  })

  it('(f) "Favoritos" vazia: OK no botão devolve o foco à trilha (ativação por tecla)', async () => {
    await seedSource()
    mockCategories([category(1, 'G1', 0)])
    renderLive()

    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => expect(screen.getByText('Nenhum favorito ainda')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')

    tap('Enter') // nunca um clique — o controle remoto usa OK

    expect(screen.queryByText('Nenhum favorito ainda')).not.toBeInTheDocument()
    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('★Favoritos')
  })

  it('(g) favorito gravado sem item carregado: nota avisa, sem citar número', async () => {
    await seedSource()
    await seedRealChannel('Carregado', '1')
    await favoriteChannel('1', 100)
    await favoriteChannel('999', 200) // sem registro correspondente no catálogo
    mockCategories([category(1, 'G1', 0)])
    renderLive()

    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => {
      const note = screen.getByText(/ainda não apareceram aqui/)
      expect(note.textContent).not.toMatch(/\d/)
    })
    // "Carregado" aparece na linha da lista E no painel de prévia — a
    // ambiguidade em si já prova que o item resolveu e está focado.
    expect(document.querySelectorAll('.live-column-channels .live-item-name')).toHaveLength(1)
    expect(document.querySelector('.live-column-channels .live-item-name')?.textContent).toBe('Carregado')
  })

  it('(h) desfavoritar o focado dentro de "Favoritos" move o foco ao vizinho', async () => {
    await seedSource()
    await seedRealChannel('A', '1', 0)
    await seedRealChannel('B', '2', 1)
    await seedRealChannel('C', '3', 2)
    await favoriteChannel('1', 100)
    await favoriteChannel('2', 200)
    await favoriteChannel('3', 300) // ordem exibida: C, B, A
    mockCategories([category(1, 'G1', 0)])
    renderLive()

    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() => {
      const names = document.querySelectorAll('.live-column-channels .live-item-name')
      expect([...names].map((n) => n.textContent)).toEqual(['C', 'B', 'A'])
    })

    keydown('ArrowDown') // foca "B" (índice 1)
    keyup('ArrowDown')
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B')

    await holdEnter() // desfavorita "B"
    keyup('Enter')

    await waitFor(() => {
      const names = document.querySelectorAll('.live-column-channels .live-item-name')
      expect([...names].map((n) => n.textContent)).toEqual(['C', 'A'])
    })
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('A')
  }, 10000)

  it('(i) fechar o player devolve o foco ao mesmo canal dentro de "Favoritos"', async () => {
    await seedSource()
    await seedRealChannel('Favorito', '1')
    await favoriteChannel('1', 100)
    mockCategories([category(1, 'G1', 0)])
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
      item_id: 'id-Favorito',
      kind: 'channel',
      url: 'http://exemplo.invalid/x.ts',
      container_hint: 'ts',
      source_id: SOURCE_ID,
      provider_stream_id: '1',
      original_name: 'Favorito',
      series_id: null,
      season_number: null,
      episode_number: null,
    })
    renderLive()

    keydown('ArrowUp')
    keyup('ArrowUp')
    keydown('ArrowRight')
    keyup('ArrowRight')

    await waitFor(() =>
      expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('Favorito'),
    )

    tap('Enter')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    keydown('Escape')
    keyup('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('Favorito')
    expect(
      document.querySelector('.live-column-channels .live-column-title')?.textContent,
    ).toBe('★ Favoritos')
  })

  it('(j) categoria da fonte chamada "Favoritos" convive com a entrada virtual, sem colidir', async () => {
    await seedSource()
    await seedRealChannel('DoUsuario', '1')
    await favoriteChannel('1', 100)
    mockCategories([category(1, 'Favoritos', 0), category(2, 'Esportes', 1)])
    mockContentByCategory({ 1: [channel('DaFonte', '55', 'Favoritos')] })
    renderLive()

    // Padrão continua sendo a primeira categoria REAL — aqui, a "Favoritos"
    // declarada pela fonte, não a virtual.
    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('Favoritos')
    keydown('ArrowRight')
    keyup('ArrowRight')
    expect(document.querySelector('.live-column-channels .live-item-name')?.textContent).toBe('DaFonte')

    keydown('ArrowLeft')
    keyup('ArrowLeft')
    keydown('ArrowUp') // sobe pra entrada virtual, acima da categoria "Favoritos" da fonte
    keyup('ArrowUp')
    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('★Favoritos')

    keydown('ArrowRight')
    keyup('ArrowRight')
    await waitFor(() =>
      expect(document.querySelector('.live-column-channels .live-item-name')?.textContent).toBe('DoUsuario'),
    )
  })

  it('(k) mover o foco sobre "★ Favoritos" não resolve nada (D-005 — focar não gasta)', async () => {
    await seedSource()
    await seedRealChannel('X', '1')
    await favoriteChannel('1', 100)
    mockCategories([category(1, 'G1', 0)])
    const resolveSpy = vi.spyOn(catalogRepository, 'resolveFavorites')
    renderLive()

    keydown('ArrowUp') // foca "★ Favoritos" — não entra
    keyup('ArrowUp')
    keydown('ArrowDown') // volta a focar a categoria real — não entra
    keyup('ArrowDown')

    expect(resolveSpy).not.toHaveBeenCalled()
  })
})

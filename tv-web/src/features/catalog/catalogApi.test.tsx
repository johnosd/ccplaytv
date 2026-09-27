import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  prefetchCategoryContent,
  stableIdOf,
  useAggregatedItems,
  useCatalogCounts,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useFavoriteIds,
  useFavoritesContent,
  useHistoryContent,
  useResumePositions,
  invalidateUserState,
  useSeriesEpisodes,
  useSeriesWatchedSummary,
  useToggleFavorite,
  useToggleWatched,
  type CatalogCategory,
  type CatalogItemOut,
} from './catalogApi'
import * as categoryLoader from '../../lib/catalog/categoryLoader'
import * as seriesLoader from '../../lib/catalog/seriesLoader'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'
import { db, type CategoryRecord } from '../../lib/catalog/db'

vi.mock('../../lib/catalog/categoryLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/categoryLoader')>()
  return { ...actual, ensureCategory: vi.fn() }
})

function category(id: number, overrides: Partial<CatalogCategory> = {}): CatalogCategory {
  return {
    id,
    kind: 'channel',
    name: `Categoria ${id}`,
    order: id,
    count: 0,
    fetchMode: 'on_demand',
    providerCategoryId: String(id),
    ...overrides,
  }
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useCategoryFocusPrefetch (feature 010 — desvio deliberado de FR-004)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(categoryLoader.ensureCategory).mockResolvedValue({ outcome: 'fresh' })
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    await db.channels.clear()
    await db.categories.clear()
  })

  it('não busca antes de o cursor parar na categoria (amortecido — R-002)', () => {
    const { rerender } = renderHook(
      ({ cat }: { cat: CatalogCategory | undefined }) => useCategoryFocusPrefetch('source-1', cat),
      { wrapper: wrapper(), initialProps: { cat: category(1) } },
    )

    // Cursor sobrevoa três categorias rápido, sem parar em nenhuma.
    rerender({ cat: category(2) })
    rerender({ cat: category(3) })
    vi.advanceTimersByTime(200) // menos que o amortecimento

    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()
  })

  it('busca só a categoria onde o cursor de fato ficou, depois do amortecimento', () => {
    const { rerender } = renderHook(
      ({ cat }: { cat: CatalogCategory | undefined }) => useCategoryFocusPrefetch('source-1', cat),
      { wrapper: wrapper(), initialProps: { cat: category(1) } },
    )

    rerender({ cat: category(2) })
    vi.advanceTimersByTime(400) // além do amortecimento, parado em "2"

    expect(categoryLoader.ensureCategory).toHaveBeenCalledTimes(1)
    // Terceiro argumento: `{ signal }` — bug
    // `prefetch-concorrente-categoria-sem-cancelamento-requisicao`, todo
    // prefetch agora carrega um `AbortController` próprio.
    expect(categoryLoader.ensureCategory).toHaveBeenCalledWith('source-1', category(2), {
      signal: expect.any(AbortSignal),
    })
  })

  it('sem categoria em foco (undefined), não agenda nada', () => {
    renderHook(({ cat }: { cat: CatalogCategory | undefined }) => useCategoryFocusPrefetch('source-1', cat), {
      wrapper: wrapper(),
      initialProps: { cat: undefined },
    })

    vi.advanceTimersByTime(1000)

    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()
  })

  // Feature 015: achado ao testar a capa real numa categoria `stored`
  // grande — sem este cuidado, um timer já agendado antes da entrada
  // disparava depois dela, relia uma categoria `stored` já consumida e
  // sobrescrevia o cache de `useCategoryContent` com `source_missing`,
  // fazendo o conteúdo já exibido sumir sozinho da tela.
  it('categoria já entrada nunca prefetcha, mesmo depois do amortecimento', () => {
    renderHook(() => useCategoryFocusPrefetch('source-1', category(1), 1), { wrapper: wrapper() })

    vi.advanceTimersByTime(1000)

    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()
  })

  it('entrar na categoria focada cancela um timer de prefetch já agendado', () => {
    const { rerender } = renderHook(
      ({ enteredId }: { enteredId?: number }) => useCategoryFocusPrefetch('source-1', category(1), enteredId),
      { wrapper: wrapper(), initialProps: { enteredId: undefined as number | undefined } },
    )

    vi.advanceTimersByTime(100) // menos que o amortecimento — timer ainda pendente
    rerender({ enteredId: 1 }) // a pessoa entrou na categoria 1 antes do timer disparar
    vi.advanceTimersByTime(1000) // bem além do amortecimento original

    expect(categoryLoader.ensureCategory).not.toHaveBeenCalled()
  })

  it('categoria diferente da entrada continua prefetchando normalmente', () => {
    renderHook(() => useCategoryFocusPrefetch('source-1', category(2), 1), { wrapper: wrapper() })

    vi.advanceTimersByTime(400)

    expect(categoryLoader.ensureCategory).toHaveBeenCalledTimes(1)
    expect(categoryLoader.ensureCategory).toHaveBeenCalledWith('source-1', category(2), {
      signal: expect.any(AbortSignal),
    })
  })

  // Bug prefetch-concorrente-categoria-sem-cancelamento-requisicao: cada
  // busca de prefetch some assim que deixa de ser a categoria focada — só
  // a última em que o cursor de fato ficou chega a `ensureCategory`.
  it('focar uma segunda categoria aborta o prefetch em voo da primeira', () => {
    const { rerender } = renderHook(
      ({ cat }: { cat: CatalogCategory | undefined }) => useCategoryFocusPrefetch('source-1', cat),
      { wrapper: wrapper(), initialProps: { cat: category(1) } },
    )
    vi.advanceTimersByTime(400) // categoria 1 dispara e fica "em voo" (ensureCategory nunca resolve neste teste)

    const [, , firstOptions] = vi.mocked(categoryLoader.ensureCategory).mock.calls[0]!
    const firstSignal = (firstOptions as { signal: AbortSignal }).signal
    expect(firstSignal.aborted).toBe(false)

    rerender({ cat: category(2) })
    vi.advanceTimersByTime(400) // categoria 2 dispara — deve abortar o sinal da categoria 1

    expect(firstSignal.aborted).toBe(true)
    expect(categoryLoader.ensureCategory).toHaveBeenCalledTimes(2)
  })

  // A categoria que a pessoa efetivamente ENTROU nunca pode ser abortada
  // por um prefetch de outra categoria — ela pode estar compartilhando a
  // mesma busca em voo via dedup do categoryLoader (D-008 desta feature/
  // R-013), e abortar isso quebraria a entrada real, não só o prefetch.
  it('entrar de fato numa categoria nunca é abortada por um prefetch de outra', () => {
    const { rerender } = renderHook(
      ({ cat, enteredId }: { cat: CatalogCategory | undefined; enteredId?: number }) =>
        useCategoryFocusPrefetch('source-1', cat, enteredId),
      { wrapper: wrapper(), initialProps: { cat: category(1), enteredId: undefined as number | undefined } },
    )
    vi.advanceTimersByTime(400) // prefetch da categoria 1 dispara

    const [, , enteredOptions] = vi.mocked(categoryLoader.ensureCategory).mock.calls[0]!
    const enteredSignal = (enteredOptions as { signal: AbortSignal }).signal

    // A pessoa entra de fato na categoria 1 (a busca acima passa a servir
    // a entrada real via dedup) e o cursor da trilha segue para a 2.
    rerender({ cat: category(2), enteredId: 1 })
    vi.advanceTimersByTime(400) // prefetch da categoria 2 dispara

    expect(enteredSignal.aborted).toBe(false)
  })
})

describe('useCatalogCounts — canais seguem a mesma regra honesta de filmes/séries (sdd-converge C-001)', () => {
  const SOURCE_ID = 'source-counts'

  async function seedCategories(categories: Omit<CategoryRecord, 'id' | 'sourceId' | 'generation'>[]) {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte de teste',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await db.categories.bulkAdd(
      categories.map((category) => ({ ...category, sourceId: SOURCE_ID, generation: 1 })),
    )
  }

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.categories.clear()
  })

  it('canal eager soma os itens reais gravados, como filme/série eager já somava', async () => {
    await seedCategories([
      { kind: 'channel', fetchMode: 'eager', order: 0, name: 'Notícias', itemsCount: 12 },
      { kind: 'channel', fetchMode: 'eager', order: 1, name: 'Esportes', itemsCount: 8 },
    ])

    const { result } = renderHook(() => useCatalogCounts(SOURCE_ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.channels).toEqual({ items: 20, categories: 2 })
  })

  it('canal on_demand sem contagem declarada mostra o piso de categorias, nunca "0" (FR-014)', async () => {
    await seedCategories([
      { kind: 'channel', fetchMode: 'on_demand', order: 0, name: 'Filmes 24h', providerCategoryId: '1' },
      { kind: 'channel', fetchMode: 'on_demand', order: 1, name: 'Documentários', providerCategoryId: '2' },
      { kind: 'channel', fetchMode: 'on_demand', order: 2, name: 'Infantil', providerCategoryId: '3' },
    ])

    const { result } = renderHook(() => useCatalogCounts(SOURCE_ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.channels).toEqual({ items: undefined, categories: 3 })
  })

  it('categoria stored ainda não lida soma declaredCount (feature 014, D-011)', async () => {
    await seedCategories([
      { kind: 'channel', fetchMode: 'stored', order: 0, name: 'Esportes', declaredCount: 30 },
      { kind: 'channel', fetchMode: 'stored', order: 1, name: 'Notícias', declaredCount: 10 },
    ])

    const { result } = renderHook(() => useCatalogCounts(SOURCE_ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.channels).toEqual({ items: 40, categories: 2 })
  })

  it('categoria stored já lida soma a contagem real (count/itemsCount), não mais declaredCount', async () => {
    await seedCategories([
      // declaredCount e itemsCount podem divergir (a varredura promete um
      // número, a leitura real é outro) — depois de lida, o real vence.
      { kind: 'channel', fetchMode: 'stored', order: 0, name: 'Esportes', declaredCount: 30, itemsFetchedAt: 1000, itemsCount: 28 },
    ])

    const { result } = renderHook(() => useCatalogCounts(SOURCE_ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.channels).toEqual({ items: 28, categories: 1 })
  })

  it('categorias stored lidas e não lidas somam count e declaredCount juntos', async () => {
    await seedCategories([
      { kind: 'channel', fetchMode: 'stored', order: 0, name: 'Esportes', declaredCount: 30, itemsFetchedAt: 1000, itemsCount: 30 },
      { kind: 'channel', fetchMode: 'stored', order: 1, name: 'Notícias', declaredCount: 10 },
    ])

    const { result } = renderHook(() => useCatalogCounts(SOURCE_ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.channels).toEqual({ items: 40, categories: 2 })
  })
})

describe('prefetchCategoryContent / useCategoryContent — categoria stored (feature 014, T052)', () => {
  const SOURCE_ID = 'source-stored-content'

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.categories.clear()
    await db.channels.clear()
    vi.restoreAllMocks()
  })

  it('lê uma categoria stored pelo mesmo ensureCategory de qualquer outra — nunca fetch direto aqui', async () => {
    vi.mocked(categoryLoader.ensureCategory).mockResolvedValue({ outcome: 'fetched' })
    const cat = category(1, { fetchMode: 'stored', kind: 'movie' })

    const { result } = renderHook(() => useCategoryContent(SOURCE_ID, cat), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(categoryLoader.ensureCategory).toHaveBeenCalledWith(SOURCE_ID, cat)
  })

  it('pré-carga seguida da entrada explícita mostra o conteúdo já pronto, sem esperar nova leitura', async () => {
    vi.mocked(categoryLoader.ensureCategory).mockResolvedValue({ outcome: 'fetched' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const cat = category(2, { fetchMode: 'stored', kind: 'series' })

    await prefetchCategoryContent(queryClient, SOURCE_ID, cat)

    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    // `initialData` do cache já populado pela pré-carga: o primeiro render
    // já chega com dado, nunca em `isLoading` — é o que faz a categoria
    // "já estar pronta quando a entrada acontecer" (feature 010, FR-004).
    // Uma segunda chamada a `ensureCategory` no mount é esperada e inofensiva
    // (staleTime padrão do React Query é 0): para uma categoria `stored` já
    // lida, `ensureCategory` devolve `fresh` sem nenhum I/O — é isso que
    // `categoryLoader.test.ts` (T028) verifica na implementação real, não
    // mockada.
    const { result } = renderHook(() => useCategoryContent(SOURCE_ID, cat), { wrapper: Wrapper })

    expect(result.current.isLoading).toBe(false)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('pré-carga e entrada explícita disparadas ao mesmo tempo na mesma categoria fazem uma leitura só (dedup do React Query)', async () => {
    let resolveEnsure: ((value: { outcome: 'fetched' }) => void) | undefined
    vi.mocked(categoryLoader.ensureCategory).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnsure = resolve
        }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const cat = category(3, { fetchMode: 'stored', kind: 'channel' })

    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    const prefetchPromise = prefetchCategoryContent(queryClient, SOURCE_ID, cat)
    const { result } = renderHook(() => useCategoryContent(SOURCE_ID, cat), { wrapper: Wrapper })

    resolveEnsure?.({ outcome: 'fetched' })
    await prefetchPromise
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(categoryLoader.ensureCategory).toHaveBeenCalledTimes(1)
  })

  it('toItemOut expõe icon_url a partir de iconUrl do registro (feature 015)', async () => {
    vi.mocked(categoryLoader.ensureCategory).mockResolvedValue({ outcome: 'fresh' })
    await db.sources.put({
      id: SOURCE_ID,
      type: 'm3u_url',
      displayName: 'Fonte com capa',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await db.channels.bulkAdd([
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'movie',
        name: 'Com capa',
        originalName: 'Com capa',
        groupOrder: 4,
        categoryId: 4,
        categoryPosition: 0,
        iconUrl: 'http://exemplo.test/capa.png',
      },
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'movie',
        name: 'Sem capa',
        originalName: 'Sem capa',
        groupOrder: 4,
      },
    ])
    const cat = category(4, { fetchMode: 'stored', kind: 'movie' })

    const { result } = renderHook(() => useCategoryContent(SOURCE_ID, cat), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const items = result.current.data?.items ?? []
    expect(items.find((i) => i.name === 'Com capa')?.icon_url).toBe('http://exemplo.test/capa.png')
    expect(items.find((i) => i.name === 'Sem capa')?.icon_url).toBeNull()
  })

  // feature 024, T014/T007: category_id/category_position (base do número do
  // canal) e source_number (nunca populado — ver o comentário do campo).
  it('toItemOut expõe category_id/category_position/source_number a partir do registro (feature 024)', async () => {
    vi.mocked(categoryLoader.ensureCategory).mockResolvedValue({ outcome: 'fresh' })
    await db.sources.put({
      id: SOURCE_ID,
      type: 'm3u_url',
      displayName: 'Fonte com posição',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await db.channels.bulkAdd([
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'channel',
        name: 'Com posição',
        originalName: 'Com posição',
        groupOrder: 5,
        categoryId: 5,
        categoryPosition: 2,
      },
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'channel',
        name: 'Gravado antes da 024',
        originalName: 'Gravado antes da 024',
        groupOrder: 5,
      },
    ])
    const cat = category(5, { fetchMode: 'stored', kind: 'channel' })

    const { result } = renderHook(() => useCategoryContent(SOURCE_ID, cat), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const items = result.current.data?.items ?? []
    const withPosition = items.find((i) => i.name === 'Com posição')
    expect(withPosition?.category_id).toBe(5)
    expect(withPosition?.category_position).toBe(2)
    expect(withPosition?.source_number).toBeNull()

    const legacy = items.find((i) => i.name === 'Gravado antes da 024')
    expect(legacy?.category_id).toBeNull()
    expect(legacy?.category_position).toBeNull()
  })
})

describe('stableIdOf (feature 012, D-006)', () => {
  it('episódio inclui temporada e episódio na chave, igual a buildStableId direto', () => {
    const id = stableIdOf({
      source_id: 'src1',
      kind: 'episode',
      provider_stream_id: null,
      series_id: '7',
      season_number: 1,
      episode_number: 3,
      original_name: 'Piloto',
    })

    expect(id).toBe(
      buildStableId({ sourceId: 'src1', kind: 'episode', seriesId: '7', seasonNumber: 1, episodeNumber: 3 }),
    )
    expect(id).toBe('src1|episode|id:7|s1|e3')
  })

  it('filme dá o mesmo resultado que a identidade calculada hoje pelo PlayerLayer/MovieDetailScreen (nada muda para a 011)', () => {
    const id = stableIdOf({
      source_id: 'src1',
      kind: 'movie',
      provider_stream_id: '100',
      original_name: 'Die Hard',
    })

    expect(id).toBe(
      buildStableId({ sourceId: 'src1', kind: 'movie', providerStreamId: '100', originalName: 'Die Hard' }),
    )
    expect(id).toBe('src1|movie|id:100')
  })

  it('canal também bate com buildStableId direto', () => {
    const id = stableIdOf({ source_id: 'src1', kind: 'channel', provider_stream_id: '55', original_name: 'Canal' })

    expect(id).toBe(buildStableId({ sourceId: 'src1', kind: 'channel', providerStreamId: '55', originalName: 'Canal' }))
  })

  it('sem identificador de painel nem nome aproveitável, devolve null em vez de lançar (D-010 da 011)', () => {
    expect(
      stableIdOf({ source_id: 'src1', kind: 'episode', provider_stream_id: null, series_id: null, original_name: '' }),
    ).toBeNull()
  })
})

describe('useFavoriteIds / useFavoritesContent / useToggleFavorite (feature 013)', () => {
  const SOURCE_ID = 'source-favorites'

  function movieItem(overrides: Partial<CatalogItemOut> = {}): CatalogItemOut {
    return {
      id: '1',
      kind: 'movie',
      name: 'Duna',
      original_group: 'Ficção',
      published: true,
      playable: true,
      source_id: SOURCE_ID,
      provider_stream_id: '42',
      original_name: 'Duna',
      ...overrides,
    }
  }

  async function seedSourceAndMovie(): Promise<number> {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte de favoritos',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    const [id] = await db.channels.bulkAdd(
      [
        {
          sourceId: SOURCE_ID,
          generation: 1,
          kind: 'movie',
          name: 'Duna',
          originalName: 'Duna',
          groupOrder: 0,
          providerStreamId: '42',
        },
      ],
      { allKeys: true },
    )
    return id as number
  }

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('useFavoriteIds devolve o Set de stableIds favoritos da fonte/tipo', async () => {
    await seedSourceAndMovie()
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '42' })
    await db.userStates.put({
      stableId,
      sourceId: SOURCE_ID,
      isFavorite: true,
      favoritedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })

    const { result } = renderHook(() => useFavoriteIds(SOURCE_ID, 'movie'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.has(stableId)).toBe(true)
    expect(result.current.data?.size).toBe(1)
  })

  it('useFavoriteIds sem fonte não consulta nada (mesmo padrão de enabled dos demais hooks)', async () => {
    const { result } = renderHook(() => useFavoriteIds(null, 'movie'), { wrapper: wrapper() })

    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('useFavoritesContent não consulta enquanto enabled=false (D-005 — focar não gasta)', async () => {
    await seedSourceAndMovie()
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '42' })
    await db.userStates.put({
      stableId,
      sourceId: SOURCE_ID,
      isFavorite: true,
      favoritedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })

    const { result } = renderHook(() => useFavoritesContent(SOURCE_ID, 'movie', false), { wrapper: wrapper() })

    // Tempo suficiente pra qualquer efeito assíncrono ter rodado, se fosse rodar.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))

    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('useFavoritesContent, entrada (enabled=true), resolve os favoritos carregados e conta os que faltam', async () => {
    await seedSourceAndMovie()
    const loadedId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '42' })
    const missingId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '999' })
    await db.userStates.bulkPut([
      { stableId: loadedId, sourceId: SOURCE_ID, isFavorite: true, favoritedAt: 2, createdAt: 1, updatedAt: 1 },
      { stableId: missingId, sourceId: SOURCE_ID, isFavorite: true, favoritedAt: 1, createdAt: 1, updatedAt: 1 },
    ])

    const { result } = renderHook(() => useFavoritesContent(SOURCE_ID, 'movie', true), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.items.map((item) => item.name)).toEqual(['Duna'])
    expect(result.current.data?.unresolved).toBe(1)
  })

  it('useToggleFavorite grava, devolve o novo estado e invalida favorite-ids/favorites-content/user-state', async () => {
    await seedSourceAndMovie()
    const item = movieItem()
    const stableId = stableIdOf(item)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: Wrapper })

    let isFavoriteNow: boolean | undefined
    await act(async () => {
      isFavoriteNow = await result.current.mutateAsync(item)
    })

    expect(isFavoriteNow).toBe(true)
    expect((await db.userStates.get(stableId!))?.isFavorite).toBe(true)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favorite-ids', SOURCE_ID, 'movie'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favorites-content', SOURCE_ID, 'movie'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user-state', stableId] })

    // Chamar de novo alterna de volta (é isso que "toggle" quer dizer).
    let isFavoriteAgain: boolean | undefined
    await act(async () => {
      isFavoriteAgain = await result.current.mutateAsync(item)
    })
    expect(isFavoriteAgain).toBe(false)
  })

  it('useToggleFavorite recusa episódio (D-009 — série é o nível de favorito)', async () => {
    const { result } = renderHook(() => useToggleFavorite(), { wrapper: wrapper() })

    await expect(
      act(() => result.current.mutateAsync(movieItem({ kind: 'episode', series_id: '7' }))),
    ).rejects.toThrow(/não é favoritável/)
  })

  it('useToggleFavorite recusa item sem identidade estável, sem gravar chave inventada', async () => {
    const { result } = renderHook(() => useToggleFavorite(), { wrapper: wrapper() })

    await expect(
      act(() => result.current.mutateAsync(movieItem({ provider_stream_id: null, original_name: '' }))),
    ).rejects.toThrow(/identidade estável/)
  })

  describe('isolamento entre fontes (feature 013, US3 cenário 5)', () => {
    const OTHER_SOURCE_ID = 'source-favorites-other'

    async function seedOtherSourceAndMovie(): Promise<void> {
      await db.sources.put({
        id: OTHER_SOURCE_ID,
        type: 'provider_credentials',
        displayName: 'Outra fonte',
        connectionState: 'synced',
        activeGeneration: 1,
        createdAt: 0,
        updatedAt: 0,
      })
      await db.channels.bulkAdd([
        {
          sourceId: OTHER_SOURCE_ID,
          generation: 1,
          kind: 'movie',
          name: 'Avatar',
          originalName: 'Avatar',
          groupOrder: 0,
          providerStreamId: '99',
        },
      ])
    }

    afterEach(async () => {
      await db.sources.delete(OTHER_SOURCE_ID)
      await db.channels.where('sourceId').equals(OTHER_SOURCE_ID).delete()
      await db.userStates.where('sourceId').equals(OTHER_SOURCE_ID).delete()
    })

    it('useFavoriteIds de uma fonte nunca devolve o stableId de outra', async () => {
      await seedSourceAndMovie()
      await seedOtherSourceAndMovie()
      const ownId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '42' })
      const otherId = buildStableId({ sourceId: OTHER_SOURCE_ID, kind: 'movie', providerStreamId: '99' })
      await db.userStates.bulkPut([
        { stableId: ownId, sourceId: SOURCE_ID, isFavorite: true, favoritedAt: 1, createdAt: 1, updatedAt: 1 },
        { stableId: otherId, sourceId: OTHER_SOURCE_ID, isFavorite: true, favoritedAt: 1, createdAt: 1, updatedAt: 1 },
      ])

      const { result } = renderHook(() => useFavoriteIds(SOURCE_ID, 'movie'), { wrapper: wrapper() })

      await waitFor(() => expect(result.current.data).toBeDefined())
      expect(result.current.data?.has(ownId)).toBe(true)
      expect(result.current.data?.has(otherId)).toBe(false)
      expect(result.current.data?.size).toBe(1)
    })

    it('useFavoritesContent de uma fonte nunca resolve o favorito de outra', async () => {
      await seedSourceAndMovie()
      await seedOtherSourceAndMovie()
      const ownId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '42' })
      const otherId = buildStableId({ sourceId: OTHER_SOURCE_ID, kind: 'movie', providerStreamId: '99' })
      await db.userStates.bulkPut([
        { stableId: ownId, sourceId: SOURCE_ID, isFavorite: true, favoritedAt: 1, createdAt: 1, updatedAt: 1 },
        { stableId: otherId, sourceId: OTHER_SOURCE_ID, isFavorite: true, favoritedAt: 1, createdAt: 1, updatedAt: 1 },
      ])

      const { result } = renderHook(() => useFavoritesContent(SOURCE_ID, 'movie', true), { wrapper: wrapper() })

      await waitFor(() => expect(result.current.data).toBeDefined())
      expect(result.current.data?.items.map((item) => item.name)).toEqual(['Duna'])
      expect(result.current.data?.unresolved).toBe(0)
    })
  })
})

describe('useAggregatedItems (feature 018 — categoria virtual "Todos")', () => {
  const SOURCE_ID = 'source-todos'

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.categories.where('sourceId').equals(SOURCE_ID).delete()
    vi.restoreAllMocks()
  })

  async function seed(): Promise<void> {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte Todos',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await db.categories.bulkAdd([
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'movie',
        name: 'Ação',
        order: 0,
        fetchMode: 'on_demand',
        providerCategoryId: '1',
        itemsFetchedAt: 1, // já coberta
      },
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'movie',
        name: 'Comédia',
        order: 1,
        fetchMode: 'on_demand',
        providerCategoryId: '2', // nunca aberta — não coberta
      },
    ])
    await db.channels.bulkAdd([
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'movie',
        name: 'Duna',
        originalName: 'Duna',
        group: 'Ação',
        groupOrder: 0,
        providerStreamId: '1',
      },
    ])
  }

  it('agrega itens de todas as categorias já cobertas; categoria nunca aberta fica de fora da lista e da cobertura', async () => {
    await seed()
    const { result } = renderHook(() => useAggregatedItems(SOURCE_ID, 'movie', true), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.items.map((item) => item.name)).toEqual(['Duna']))
    expect(result.current.coveredCategories).toBe(1)
    expect(result.current.totalCategories).toBe(2)
  })

  it('enabled: false não lê nada do banco', async () => {
    await seed()
    const spy = vi.spyOn(db.channels, 'where')

    renderHook(() => useAggregatedItems(SOURCE_ID, 'movie', false), { wrapper: wrapper() })
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('useSeriesWatchedSummary (feature 019, D-007/D-008)', () => {
  const SOURCE_ID = 'source-watched-summary'

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
    vi.restoreAllMocks()
  })

  async function seed(): Promise<void> {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte Watched Summary',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await db.channels.bulkAdd([
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'episode',
        name: 'S01E01',
        originalName: 'S01E01',
        groupOrder: 0,
        seriesId: 'serie-1',
        providerStreamId: '1',
        seasonNumber: 1,
        episodeNumber: 1,
      },
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'episode',
        name: 'S01E02',
        originalName: 'S01E02',
        groupOrder: 0,
        seriesId: 'serie-1',
        providerStreamId: '2',
        seasonNumber: 1,
        episodeNumber: 2,
      },
    ])
  }

  it('nunca chama ensureSeriesEpisodes/rede — só lê o que já está local (Constitution: Comandos Locais Independem de Rede)', async () => {
    await seed()
    const spy = vi.spyOn(seriesLoader, 'ensureSeriesEpisodes')

    const { result } = renderHook(() => useSeriesWatchedSummary(SOURCE_ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data?.get('serie-1')).toEqual({ known: 2, watched: 0, upToDate: false }))
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('mapeamento de ano/inclusão/duração/imagem — feature 025 (T009, T020)', () => {
  const SOURCE_ID = 'source-metadados-025'

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('toItemOut mapeia year/added_at do registro (via useHistoryContent)', async () => {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Filme',
      originalName: 'Filme',
      groupOrder: 0,
      providerStreamId: 'm1',
      year: 2019,
      addedAt: 1_700_000_000_000,
    })
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'm1' })
    await updateProgress(stableId, SOURCE_ID, 30)

    const { result } = renderHook(() => useHistoryContent(SOURCE_ID, 'movie', true), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data?.items).toHaveLength(1))
    expect(result.current.data?.items[0].year).toBe(2019)
    expect(result.current.data?.items[0].added_at).toBe(1_700_000_000_000)
  })

  it('toEpisodeOut mapeia icon_url/duration_seconds do registro (via useSeriesEpisodes, categoria fresca)', async () => {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    const [seriesRecordId] = await db.channels.bulkAdd(
      [
        {
          sourceId: SOURCE_ID,
          generation: 1,
          kind: 'series',
          name: 'Série',
          originalName: 'Série',
          groupOrder: 0,
          seriesId: 's1',
          episodesFetchedAt: Date.now(),
        },
        {
          sourceId: SOURCE_ID,
          generation: 1,
          kind: 'episode',
          name: 'S01E01',
          originalName: 'S01E01',
          groupOrder: 0,
          seriesId: 's1',
          providerStreamId: 'e1',
          seasonNumber: 1,
          episodeNumber: 1,
          iconUrl: 'http://exemplo.test/ep.png',
          durationSeconds: 1500,
        },
      ],
      { allKeys: true },
    )

    const { result } = renderHook(() => useSeriesEpisodes(String(seriesRecordId)), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data?.episodes).toHaveLength(1))
    expect(result.current.data?.episodes[0].icon_url).toBe('http://exemplo.test/ep.png')
    expect(result.current.data?.episodes[0].duration_seconds).toBe(1500)
  })
})

describe('useHistoryContent (feature 025, FR-007/FR-009)', () => {
  const SOURCE_ID = 'source-history-025'

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('enabled: false não lê nada (a contagem só existe depois da 1ª entrada na sessão)', async () => {
    const { result } = renderHook(() => useHistoryContent(SOURCE_ID, 'movie', false), { wrapper: wrapper() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('sourceId nulo desliga a consulta (mesmo padrão de useFavoriteIds/useAggregatedItems)', () => {
    const { result } = renderHook(() => useHistoryContent(null, 'movie', true), { wrapper: wrapper() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  // T042 (feature 025, US2): reproduzir → invalidar → contagem de ↺
  // atualizada — o mesmo caminho que o fechamento real do player já chama
  // (`invalidateUserState`, T013), sem precisar remontar a tela.
  it('reproduzir um filme e invalidar (fechamento do player) atualiza o conteúdo já habilitado', async () => {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Filme',
      originalName: 'Filme',
      groupOrder: 0,
      providerStreamId: 'm1',
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    const { result } = renderHook(() => useHistoryContent(SOURCE_ID, 'movie', true), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data?.items).toHaveLength(0))

    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'm1' })
    await updateProgress(stableId, SOURCE_ID, 30)
    invalidateUserState(queryClient, stableId)

    await waitFor(() => expect(result.current.data?.items).toHaveLength(1))
    expect(result.current.data?.items[0].name).toBe('Filme')
  })
})

describe('useResumePositions (feature 025, D-014)', () => {
  const SOURCE_ID = 'source-resume-025'

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('devolve a posição por stableId, isolada por fonte e tipo', async () => {
    const movieId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'm1' })
    const episodeId = buildStableId({
      sourceId: SOURCE_ID,
      kind: 'episode',
      providerStreamId: 'e1',
      seasonNumber: 1,
      episodeNumber: 1,
    })
    await updateProgress(movieId, SOURCE_ID, 42)
    await updateProgress(episodeId, SOURCE_ID, 99)

    const { result } = renderHook(() => useResumePositions(SOURCE_ID, 'movie'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data?.get(movieId)).toBe(42))
    expect(result.current.data?.has(episodeId)).toBe(false)
  })
})

describe('useToggleWatched invalida history-content e resume-positions (feature 025, `logic/historico.md` §5)', () => {
  const SOURCE_ID = 'source-toggle-watched-025'

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('marcar assistido invalida as duas chaves de consulta', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'm1' })

    const { result } = renderHook(() => useToggleWatched(), { wrapper: Wrapper })
    await act(async () => {
      await result.current.mutateAsync({ stableId, sourceId: SOURCE_ID, watched: true })
    })

    const keys = invalidateSpy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey[0])
    expect(keys).toContain('history-content')
    expect(keys).toContain('resume-positions')
  })
})

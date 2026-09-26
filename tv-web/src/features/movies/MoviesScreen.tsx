import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  stableIdOf,
  useAggregatedItems,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
  useFavoriteIds,
  useFavoritesContent,
  useWatchedIds,
  type CatalogCategory,
} from '../catalog/catalogApi'
import { normalizeForSearch, searchWithinItems, SEARCH_MIN_CHARS } from '../../lib/catalog/catalogSearch'
import { clamp, gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'
import { usePosterColumnWidth } from '../../lib/focus/usePosterColumnWidth'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { FavoriteHint, FavoritesEmptyState, FavoritesUnresolvedNote } from '../favorites/FavoritesState'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { PosterArt } from '../../components/PosterArt'
import type { CategoryScreenSnapshot } from '../catalog/categoryScreenSnapshot'

const GRID_COLS = 6
/**
 * Espaço vertical que cada linha da grade precisa além da altura do
 * pôster (`aspect-ratio: 2/3`, feature 009 `research.md`/
 * `logic/virtualizacao-foco.md` §4): título (15px + margin-top 10px) +
 * metadado (13px) + o espaçamento entre linhas que a posição absoluta
 * deixou de herdar do `gap: 24px` que `.poster-grid` tinha como CSS Grid.
 */
const POSTER_ROW_EXTRA_PX = 68

export interface MoviesScreenProps {
  sourceId: string
  /**
   * `snapshot` (feature 017): o estado da tela no instante em que o filme
   * foi aberto — o `App` o guarda no histórico e o devolve em `restore` ao
   * voltar do detalhe. Opcional só enquanto o stub do plan não é implementado.
   */
  onOpenMovie: (movieId: string, snapshot?: CategoryScreenSnapshot) => void
  /** Estado a restaurar ao voltar do detalhe (feature 017, FR-019). */
  restore?: CategoryScreenSnapshot
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo guardado de uma categoria sumiu do aparelho. */
  onResync: () => void
}

/**
 * A trilha de categorias (feature 013) é "★ Favoritos" seguida das
 * categorias declaradas pela fonte — mesmo modelo de `LiveScreen.tsx`
 * (D-004 do plan.md): Favoritos nunca é gravado nem conta como categoria,
 * e uma categoria da fonte chamada "Favoritos" nunca colide com a virtual,
 * porque `kind` distingue as duas mesmo com o mesmo texto exibido. "Todos"
 * (feature 018, D-001) segue o mesmo modelo — categoria virtual, nunca gravada.
 */
type TrailKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; name: string }

function sameTrailKey(a: TrailKey, b: TrailKey): boolean {
  if (a.kind === 'category') return b.kind === 'category' && b.name === a.name
  return a.kind === b.kind
}

interface TrailEntry {
  key: TrailKey
  category?: CatalogCategory
}

/** O que entrou de fato na grade — Favoritos, Todos, ou uma categoria por id. */
type EnteredKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; id: number }

function locate<T>(items: T[], matches: (item: T) => boolean): number {
  const idx = items.findIndex(matches)
  return idx === -1 ? 0 : idx
}

/**
 * Padrão sem navegação prévia: a primeira categoria REAL (depois de
 * "★ Favoritos" e "Todos", feature 018), não uma entrada virtual — mesma
 * decisão de `LiveScreen.tsx`, pelo mesmo motivo (a maioria não tem
 * favorito nenhum ainda). `VIRTUAL_TRAIL_COUNT` é constante — sempre 2.
 */
const VIRTUAL_TRAIL_COUNT = 2

function defaultTrailIdx(trail: TrailEntry[]): number {
  return Math.min(VIRTUAL_TRAIL_COUNT, trail.length - 1)
}

export function MoviesScreen({ sourceId, onOpenMovie, restore, onBack, onResync }: MoviesScreenProps) {
  const [col, setCol] = useState<0 | 1>(restore?.col ?? 0)
  const { toastMessage, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // Estrutura: rápida, nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'movie')
  const categories = categoriesQuery.data ?? []

  const trail: TrailEntry[] = [
    { key: { kind: 'favorites' } },
    { key: { kind: 'all' } },
    ...categories.map((category) => ({
      key: { kind: 'category', name: groupLabel(category.name) } as TrailKey,
      category,
    })),
  ]

  const [focusedTrailKey, setFocusedTrailKey] = useState<TrailKey | null>(restore?.trailKey ?? null)
  // Sem identidade ainda, OU identidade que sumiu de vez do catálogo novo:
  // cai na primeira categoria REAL, não numa entrada virtual (mesmo cuidado
  // de `LiveScreen.tsx`).
  const categoryIdx =
    focusedTrailKey === null
      ? defaultTrailIdx(trail)
      : (() => {
          const idx = trail.findIndex((entry) => sameTrailKey(entry.key, focusedTrailKey))
          return idx === -1 ? defaultTrailIdx(trail) : idx
        })()
  const focusedTrailEntry = trail[categoryIdx]
  const focusedCategory = focusedTrailEntry?.category
  const isFavoritesFocused = focusedTrailEntry?.key.kind === 'favorites'
  const isAllFocused = focusedTrailEntry?.key.kind === 'all'

  // Trilha de categorias não é virtualizada (D-004) e usa uma classe CSS
  // pra foco, não foco real de DOM — sem isto, o item focado descia pra
  // fora da área visível numa fonte com muitas categorias e ficava lá
  // (achado na TV física, feature 009, Cenário B — mesmo padrão da
  // LiveScreen).
  const focusedCategoryRef = useScrollFocusedIntoView<HTMLButtonElement>(categoryIdx)

  // "Entrada" — a categoria (ou Favoritos/Todos) que a pessoa comprometeu-se
  // a ver troca de coluna e exibe o conteúdo (em geral já pré-buscado,
  // abaixo). Declarado antes do pré-fetch, que precisa saber a categoria
  // já entrada (feature 015).
  const [entered, setEntered] = useState<EnteredKey | null>(restore?.entered ?? null)
  const enteredCategory = entered?.kind === 'category' ? categories.find((c) => c.id === entered.id) : undefined
  const enteredFavorites = entered?.kind === 'favorites'
  const enteredAll = entered?.kind === 'all'

  /**
   * Busca por categoria (feature 018) — sub-estado de qualquer entrada já
   * aberta (D-002), nunca uma entrada própria. `topFocused` generaliza o
   * antigo `searchFieldFocused` (feature 017): o foco visual, dentro da
   * grade, está no elemento do topo — o ícone quando a busca está inativa,
   * o campo (foco DOM real) quando ativa. Ao restaurar (voltar do
   * detalhe), o foco vai pro ITEM, nunca pro topo — por isso `topFocused`
   * nunca lê de `restore`.
   */
  const [searchActive, setSearchActive] = useState(restore?.searchActive ?? false)
  const [searchTerm, setSearchTerm] = useState(restore?.searchTerm ?? '')
  const [topFocused, setTopFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const belowMinimum = normalizeForSearch(searchTerm).length < SEARCH_MIN_CHARS

  useEffect(() => {
    if (searchActive && topFocused) searchInputRef.current?.focus()
    else searchInputRef.current?.blur()
  }, [searchActive, topFocused])

  // Pré-busca a categoria em foco depois que o cursor para nela por um
  // instante — desvio deliberado de FR-004, ver LiveScreen.tsx e plan.md
  // R-013. "Favoritos"/"Todos" nunca prefetcham — `focusedCategory` fica
  // `undefined` quando uma delas está em foco, e o hook já ignora
  // `undefined`. Categoria já **entrada** nunca prefetcha nem deixa um
  // timer pendente disparar depois da entrada (feature 015 — ver
  // `catalogApi.ts`, `useCategoryFocusPrefetch`).
  useCategoryFocusPrefetch(
    sourceId,
    focusedCategory,
    entered?.kind === 'category' ? entered.id : undefined,
  )

  const content = useCategoryContent(sourceId, enteredCategory)
  // A estrela precisa do conjunto de favoritos mesmo numa categoria comum,
  // não só dentro de "Favoritos" — consulta separada, sempre ativa.
  const favoriteIdsQuery = useFavoriteIds(sourceId, 'movie')
  const favoriteIds = favoriteIdsQuery.data ?? new Set<string>()
  // Mesmo espírito da estrela (feature 019, D-006, SC-001): selo "Assistido"
  // visível em qualquer categoria, sem abrir o detalhe.
  const watchedIdsQuery = useWatchedIds(sourceId, 'movie')
  const watchedIds = watchedIdsQuery.data ?? new Set<string>()
  // Só resolve favorito em registro do catálogo quando a pessoa ENTROU em
  // "Favoritos" (D-005 do plan.md: focar não gasta).
  const favoritesContent = useFavoritesContent(sourceId, 'movie', enteredFavorites)
  // "Todos" (feature 018, D-005) — todos os itens já cobertos, sem filtro;
  // o filtro por termo (quando a busca está ativa) é aplicado abaixo,
  // client-side, sobre este mesmo array.
  const aggregated = useAggregatedItems(sourceId, 'movie', enteredAll)

  const baseMovies = enteredFavorites
    ? (favoritesContent.data?.items ?? [])
    : enteredAll
      ? aggregated.items
      : (content.data?.items ?? [])
  const contentIsLoading = enteredFavorites
    ? favoritesContent.isLoading
    : enteredAll
      ? aggregated.isLoading
      : content.isLoading
  const contentFailed = enteredFavorites
    ? favoritesContent.isError
    : enteredAll
      ? false
      : content.data?.outcome === 'failed' || content.isError
  // Feature 014, D-008 — mesmo motivo de LiveScreen.tsx.
  const contentMissing = entered?.kind === 'category' && content.data?.outcome === 'source_missing'
  const contentUnavailable = contentFailed || contentMissing

  // Itens de fato exibidos (feature 018, D-004): sem busca ativa, a grade
  // normal; com busca ativa e termo curto, nada (mensagem própria); com
  // termo válido, o filtro client-side — nunca uma nova leitura de dados
  // (`logic/busca-por-categoria.md` §2).
  const movies = useMemo(() => {
    if (!searchActive) return baseMovies
    if (belowMinimum) return []
    return searchWithinItems(baseMovies, searchTerm, (movie) => movie.name)
  }, [searchActive, belowMinimum, baseMovies, searchTerm])

  /**
   * O foco é guardado pela identidade do item, não pelo índice dele.
   *
   * Uma atualização em segundo plano pode publicar uma categoria menor
   * enquanto esta tela está aberta. Com um índice em estado, o de número 30
   * apontaria para o nada numa lista que passou a ter 5 — e o OK estouraria
   * ao derreferenciar `movies[30].id`. Pela identidade, o item ou é
   * reencontrado onde estiver agora, ou o foco cai no início.
   */
  const [focusedMovieId, setFocusedMovieId] = useState<string | null>(restore?.focusedItemId ?? null)
  const movieIdx = locate(movies, (movie) => movie.id === focusedMovieId)
  const activeMovie = movies[movieIdx]

  // Só o painel de conteúdo (col 1) é virtualizado — nunca a trilha de
  // categorias (D-004). Grade com `lanes: GRID_COLS`, nunca dois
  // virtualizadores compostos (D-005).
  const { columnWidth, setContainerRef, containerRef: gridContainerRef } = usePosterColumnWidth(GRID_COLS)
  const rowHeight = columnWidth * 1.5 + POSTER_ROW_EXTRA_PX

  const movieVirtualizer = useVirtualizer({
    count: movies.length,
    getScrollElement: () => gridContainerRef.current,
    estimateSize: () => rowHeight,
    lanes: GRID_COLS,
    overscan: GRID_COLS,
  })

  // O virtualizador mede e GUARDA o tamanho de cada item na primeira vez
  // que o vê — e `columnWidth` (logo `rowHeight`) só chega depois do
  // primeiro `ResizeObserver` disparar (`usePosterColumnWidth`). Sem isto,
  // linhas já medidas com o `rowHeight` mínimo (`columnWidth` ainda 0)
  // ficam erradas pra sempre: passar um `estimateSize` novo não invalida
  // sozinho o que já foi medido, só `measure()` faz isso (achado na
  // verificação na TV física, T019/R-010 — o bug sobrevivia mesmo depois
  // do `ResizeObserver` já estar anexado corretamente).
  useEffect(() => {
    movieVirtualizer.measure()
  }, [rowHeight, movieVirtualizer])

  const moviesNavigable = col === 1 && !contentIsLoading && !contentUnavailable && movies.length > 0
  useVirtualFocusSync({
    focusedIndex: movieIdx,
    scrollToIndex: movieVirtualizer.scrollToIndex,
    enabled: moviesNavigable,
  })

  /** Reseta a busca (feature 018, D-002/FR-008) — sempre que a grade troca de entrada. */
  function resetSearchState() {
    setSearchActive(false)
    setSearchTerm('')
    setTopFocused(false)
  }

  function enterCategory(category: CatalogCategory) {
    if (entered?.kind !== 'category' || entered.id !== category.id) {
      setEntered({ kind: 'category', id: category.id })
      // Trocar de categoria recomeça no primeiro item — a posição anterior
      // era de OUTRA categoria/de Favoritos/Todos, não é significativa aqui.
      setFocusedMovieId(null)
    }
    resetSearchState()
    setCol(1)
  }

  function enterFavorites() {
    if (entered?.kind !== 'favorites') {
      setEntered({ kind: 'favorites' })
      setFocusedMovieId(null)
    }
    resetSearchState()
    setCol(1)
  }

  /** Entra em "Todos" (feature 018, D-001) — mesmo padrão de `enterFavorites`. */
  function enterAll() {
    if (entered?.kind !== 'all') {
      setEntered({ kind: 'all' })
      setFocusedMovieId(null)
    }
    resetSearchState()
    setCol(1)
  }

  function enterFocusedTrailItem() {
    if (isFavoritesFocused) enterFavorites()
    else if (isAllFocused) enterAll()
    else if (focusedCategory) enterCategory(focusedCategory)
  }

  function retryContent() {
    if (enteredFavorites) void favoritesContent.refetch()
    else void content.refetch()
  }

  /**
   * Segurar OK favorita/desfavorita o filme focado (feature 013) — só na
   * grade, com um filme focado (não o ícone/campo de busca, feature 018);
   * nos demais casos `onLongSelect` fica `undefined` e o OK volta a agir
   * no keydown (abrir o detalhe), como sempre agiu (D-002 do plan.md).
   */
  const canToggleFavorite = col === 1 && !topFocused && activeMovie !== undefined

  /**
   * Alterna o favorito do filme focado — chamada tanto por segurar OK
   * (`onLongSelect`) quanto pela tecla amarela (`onFavoriteKey`, feature
   * 013, achado testando na TV física com um controle substituto). Mesmo
   * caminho de ação, só dois jeitos de chegar nele.
   */
  function toggleFocusedFavorite() {
    if (!activeMovie) return
    void favoriteToggle.toggle(activeMovie, {
      // Só dentro de "Favoritos" desfavoritar precisa mover o foco pra
      // fora do item — numa categoria comum, ele continua lá.
      visibleItems: enteredFavorites ? movies : undefined,
      onFocusNeighbor: enteredFavorites ? setFocusedMovieId : undefined,
    })
  }

  useRemoteNav({
    onDirection: (dir) => {
      // Ícone/campo no topo da grade (feature 018, D-003): qualquer
      // entrada com itens tem esse topo. ↓ do topo vai pro 1º item; ↑ na
      // PRIMEIRA LINHA da grade (índice < GRID_COLS) volta ao topo. ←/→ no
      // campo já foram capturados pela guarda de alvo editável do
      // useRemoteNav antes de chegar aqui — o que sobra de ←/→ (ícone
      // focado, sem foco DOM) precisa continuar pro fluxo padrão abaixo,
      // por isso só ↑/↓ retornam cedo aqui, nunca ← nem →.
      const hasTop = col === 1 && movies.length > 0
      if (hasTop && topFocused) {
        if (dir === 'down') {
          setTopFocused(false)
          setFocusedMovieId(movies[0].id)
        }
        if (dir === 'up' || dir === 'down') return
      }
      if (hasTop && !topFocused && dir === 'up' && movieIdx < GRID_COLS) {
        setTopFocused(true)
        return
      }

      if (col === 0) {
        if (dir === 'right') {
          enterFocusedTrailItem()
          return
        }
        if (dir === 'up' || dir === 'down') {
          const next = clamp(categoryIdx + (dir === 'down' ? 1 : -1), 0, trail.length - 1)
          if (next !== categoryIdx) {
            setFocusedTrailKey(trail[next]?.key ?? { kind: 'favorites' })
          }
        }
        return
      }

      if (dir === 'left' && movieIdx % GRID_COLS === 0) {
        setCol(0)
        return
      }
      if (!topFocused) {
        if (movies.length === 0) return
        const next = gridNextIndex(dir, movieIdx, movies.length, GRID_COLS)
        setFocusedMovieId(movies[next]?.id ?? null)
      }
    },
    onSelect: () => {
      if (col === 0) {
        enterFocusedTrailItem()
        return
      }
      // "Favoritos" vazia (FR-008): o único elemento acionável é o botão
      // "Voltar" do `FavoritesEmptyState` — sem isto, OK não faz nada aqui.
      if (enteredFavorites && !contentIsLoading && !contentFailed && movies.length === 0) {
        setCol(0)
        return
      }
      // Feature 014 (T039) + achado (bug pré-existente da 010): mesmo
      // ajuste de LiveScreen.tsx — sem isto, SELECT não ativava "Tentar de
      // novo" apesar da aparência de foco.
      if (!contentIsLoading && contentMissing) {
        onResync()
        return
      }
      if (!contentIsLoading && contentFailed) {
        retryContent()
        return
      }
      // Ícone de busca (feature 018): SELECT nele abre o campo. Só é
      // alcançado com `!searchActive` — quando o campo já tem foco DOM
      // real, a guarda de alvo editável intercepta Enter antes de chegar aqui.
      if (topFocused) {
        setSearchActive(true)
        setSearchTerm('')
        return
      }
      const movie = movies[movieIdx]
      if (!movie) return
      // Snapshot (feature 017/018, FR-009/FR-019): guardado ANTES de abrir
      // o detalhe — o `App` devolve isto em `restore` quando a pessoa
      // volta, fechando junto o bug de backlog "Voltar do detalhe pra
      // grade não restaura foco nem posição". Vale para busca E grade normal.
      onOpenMovie(movie.id, {
        trailKey: focusedTrailEntry?.key ?? null,
        entered,
        col,
        focusedItemId: movie.id,
        searchTerm,
        searchActive,
      })
    },
    onLongSelect: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onFavoriteKey: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onBack: () => {
      // Busca (feature 018): RETURN só ganha uma camada extra quando a
      // busca está ATIVA — resultado focado volta ao campo; campo focado
      // FECHA a busca (volta ao ícone, sem sair da categoria). Fora da
      // busca (item normal OU ícone parado), RETURN vai direto pra trilha.
      if (col === 1 && searchActive && !topFocused) {
        setTopFocused(true)
        return
      }
      if (col === 1 && searchActive && topFocused) {
        setSearchActive(false)
        setSearchTerm('')
        return
      }
      if (col === 1) {
        setCol(0)
        return
      }
      onBack()
    },
  })

  if (categoriesQuery.isLoading || categoriesQuery.isError || categories.length === 0) {
    // Todo estado precisa de saída focável, ou o controle fica preso
    // (constitution, "Foco Visível e Sem Becos Sem Saída").
    return (
      <div className="screen">
        <h1 className="screen-title">Filmes</h1>
        <div className="live-state">
          {categoriesQuery.isLoading && <div className="live-state-copy">Carregando filmes…</div>}
          {categoriesQuery.isError && (
            <>
              <div className="live-state-title">Não foi possível carregar os filmes</div>
              <div className="live-state-copy">Tente novamente em instantes.</div>
            </>
          )}
          {!categoriesQuery.isLoading && !categoriesQuery.isError && (
            <>
              <div className="live-state-title">Nenhum filme nesta lista</div>
              <div className="live-state-copy">
                A importação pode não ter encontrado filmes nesta fonte, ou ainda estar em
                andamento.
              </div>
            </>
          )}
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const showingContent = col === 1
  const contentStale = entered?.kind === 'category' && showingContent && content.data?.outcome === 'stale-served'
  const truncated =
    entered?.kind === 'category' && showingContent && (content.data?.totalCount ?? 0) > movies.length
  /**
   * O que o provedor prometeu e o que ele de fato entregou são fatos
   * distintos (D-005) — quando os dois existem e divergem, a tela declara
   * a diferença em vez de escondê-la (FR-015). Não se aplica a "Favoritos"/"Todos".
   */
  const declaredCount = focusedCategory?.declaredCount
  const realCount = content.data?.totalCount
  const countsDiverge =
    entered?.kind === 'category' &&
    showingContent &&
    !content.isLoading &&
    declaredCount !== undefined &&
    realCount !== undefined &&
    declaredCount !== realCount
  const unresolvedFavorites = enteredFavorites ? (favoritesContent.data?.unresolved ?? 0) : 0
  const searchNoResults = searchActive && !belowMinimum && movies.length === 0
  // Cobertura só existe/aparece dentro de "Todos" (FR-010/FR-011) — nunca
  // numa categoria real ou Favoritos, onde a busca já cobre 100% do local.
  const searchCoveragePartial = enteredAll && aggregated.coveredCategories < aggregated.totalCategories
  const showResultsGrid = searchActive
    ? !belowMinimum && movies.length > 0
    : !contentIsLoading && !contentUnavailable && movies.length > 0

  // Rótulo da entrada atualmente focada/entrada — Favoritos, Todos ou o
  // nome da categoria real (feature 018).
  const entryLabel = isAllFocused || enteredAll
    ? 'Todos'
    : isFavoritesFocused || enteredFavorites
      ? '★ Favoritos'
      : groupLabel(focusedCategory?.name)

  return (
    <div className="screen screen-row">
      <h1 className="screen-title" style={{ display: 'none' }}>
        Filmes
      </h1>
      <div className="live-column live-column-groups">
        <div className="live-column-title">Filmes</div>
        {trail.map((entry, i) => (
          <button
            key={entry.key.kind === 'category' ? `cat-${entry.category!.id}` : entry.key.kind}
            ref={categoryIdx === i ? focusedCategoryRef : undefined}
            type="button"
            className={`live-item${entry.key.kind === 'all' ? ' live-item-all' : ''}${
              entry.key.kind === 'favorites' ? ' live-item-favorites' : ''
            }${col === 0 && categoryIdx === i ? ' tv-focus' : ''}`}
          >
            {entry.key.kind === 'all' && <span>Todos</span>}
            {entry.key.kind === 'favorites' && (
              <>
                <span aria-hidden="true">★</span>
                <span>Favoritos</span>
              </>
            )}
            {entry.key.kind === 'category' && groupLabel(entry.category?.name)}
          </button>
        ))}
      </div>

      <div className="category-content">
        {showingContent && (
          <div className="category-title-row">
            <div className="live-column-title">{entryLabel}</div>
            {/* Ícone de busca (feature 018, FR-001): só quando há itens
                carregados (D-006). `!contentUnavailable` evita o ícone
                aparecer sobre um `baseMovies` obsoleto — `loadCategoryContent`
                sempre lê `channels`, que pode reter registros de uma geração
                anterior mesmo com outcome `source_missing`/`failed`
                (achado durante o gate final desta feature, T029). */}
            {!searchActive && !contentUnavailable && baseMovies.length > 0 && (
              <button
                type="button"
                className={`search-icon-button${topFocused ? ' tv-focus' : ''}`}
                aria-label="Buscar"
              >
                🔍
              </button>
            )}
          </div>
        )}

        {!showingContent && (
          <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver os filmes.</div>
        )}

        {searchActive && (
          <div className="search-field-row">
            <input
              ref={searchInputRef}
              type="text"
              className="search-field field-box"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                // Tecla "Done" do teclado do sistema da TV — mesmo efeito
                // de ↓ a partir do campo (`logic/busca-por-categoria.md` §3).
                if (event.keyCode !== 65376) return
                event.preventDefault()
                if (movies.length > 0) {
                  setTopFocused(false)
                  setFocusedMovieId(movies[0].id)
                }
              }}
              placeholder="Buscar filmes"
            />
            <div className="search-status">
              {belowMinimum && <span>Digite pelo menos 3 letras</span>}
              {!belowMinimum && <span>{movies.length === 1 ? '1 resultado' : `${movies.length} resultados`}</span>}
              {searchCoveragePartial && (
                <span className="search-coverage">
                  Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
                </span>
              )}
            </div>
          </div>
        )}

        {searchNoResults && (
          // Sem botão "ação" aqui de propósito: o campo continua com foco
          // DOM real neste estado — RETURN já garante saída (constitution).
          <div className="live-state">
            <div className="live-state-title">Nenhum resultado para "{searchTerm}"</div>
            {searchCoveragePartial && (
              <div className="live-state-copy">
                Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
              </div>
            )}
          </div>
        )}

        {enteredAll && !searchActive && searchCoveragePartial && (
          <div className="live-truncated-note">
            Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
          </div>
        )}

        {showingContent && !searchActive && contentIsLoading && (
          <div className="live-state">
            <div className="live-state-copy">Carregando filmes…</div>
            <button type="button" className="live-state-action tv-focus">
              Voltar
            </button>
          </div>
        )}

        {showingContent && !searchActive && !contentIsLoading && contentFailed && (
          <div className="live-state">
            <div className="live-state-title">Não foi possível carregar esta categoria</div>
            <button type="button" className="live-state-action tv-focus" onClick={retryContent}>
              Tentar de novo
            </button>
          </div>
        )}

        {showingContent && !searchActive && !contentIsLoading && contentMissing && (
          <div className="live-state">
            <div className="live-state-title">O conteúdo desta lista não está mais no aparelho</div>
            <button type="button" className="live-state-action tv-focus" onClick={onResync}>
              Ressincronizar lista
            </button>
          </div>
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && movies.length === 0 && (
          <FavoritesEmptyState kind="movie" focused onBack={() => setCol(0)} />
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredAll && movies.length === 0 && (
          <div className="live-state-copy">Nenhuma categoria foi obtida ainda — entre numa categoria para trazê-la para "Todos".</div>
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && entered?.kind === 'category' && movies.length === 0 && (
          <div className="live-state-copy">Esta categoria está vazia.</div>
        )}

        {showingContent && !searchActive && contentStale && (
          <div className="live-truncated-note">
            Não foi possível atualizar agora — mostrando o que já estava salvo.
          </div>
        )}

        {countsDiverge && (
          <div className="live-truncated-note">
            O provedor declarou {declaredCount} filmes nesta categoria, mas entregou {realCount}.
          </div>
        )}

        {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && (
          <FavoritesUnresolvedNote unresolved={unresolvedFavorites} />
        )}

        {showResultsGrid && <FavoriteHint />}

        {showResultsGrid && (
          <div ref={setContainerRef} className="poster-grid">
            <div className="poster-grid-inner" style={{ height: movieVirtualizer.getTotalSize() }}>
              {movieVirtualizer.getVirtualItems().map((virtualRow) => {
                const movie = movies[virtualRow.index]
                if (!movie) return null
                const isFavorite = favoriteIds.has(stableIdOf(movie) ?? '')
                const isWatched = watchedIds.has(stableIdOf(movie) ?? '')
                return (
                  <div
                    key={movie.id}
                    className="poster-cell"
                    style={{
                      left: `${(virtualRow.lane / GRID_COLS) * 100}%`,
                      width: `${100 / GRID_COLS}%`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <PosterArt
                      url={movie.icon_url ?? undefined}
                      title={movie.name}
                      focused={col === 1 && !topFocused && movieIdx === virtualRow.index}
                    >
                      {isFavorite && (
                        <span className="fav-star" aria-hidden="true">
                          ★
                        </span>
                      )}
                      {isWatched && <span className="watched-badge">Assistido</span>}
                    </PosterArt>
                    <div className="poster-card-title">{movie.name}</div>
                    <div className="poster-card-meta">
                      {enteredAll ? groupLabel(movie.original_group ?? undefined) : (movie.original_group ?? 'Filme')}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {truncated && (
          // Fala do limite de exibição, não do tamanho da categoria — a
          // distinção importa porque o catálogo publicado pode ser parcial
          // (FR-016).
          <div className="live-truncated-note">
            Mostrando os primeiros {movies.length} de {content.data?.totalCount} filmes desta categoria.
          </div>
        )}
      </div>

      <Toast message={toastMessage} />
    </div>
  )
}

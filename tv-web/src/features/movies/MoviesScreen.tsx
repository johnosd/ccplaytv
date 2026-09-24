import { useEffect, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  stableIdOf,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
  useFavoriteIds,
  useFavoritesContent,
  type CatalogCategory,
} from '../catalog/catalogApi'
import { clamp, gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'
import { usePosterColumnWidth } from '../../lib/focus/usePosterColumnWidth'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { FavoriteHint, FavoritesEmptyState, FavoritesUnresolvedNote } from '../favorites/FavoritesState'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'

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
  onOpenMovie: (movieId: string) => void
  onBack: () => void
}

/**
 * A trilha de categorias (feature 013) é "★ Favoritos" seguida das
 * categorias declaradas pela fonte — mesmo modelo de `LiveScreen.tsx`
 * (D-004 do plan.md): Favoritos nunca é gravado nem conta como categoria,
 * e uma categoria da fonte chamada "Favoritos" nunca colide com a virtual,
 * porque `kind` distingue as duas mesmo com o mesmo texto exibido.
 */
type TrailKey = { kind: 'favorites' } | { kind: 'category'; name: string }

function sameTrailKey(a: TrailKey, b: TrailKey): boolean {
  return a.kind === 'favorites' ? b.kind === 'favorites' : b.kind === 'category' && b.name === a.name
}

interface TrailEntry {
  key: TrailKey
  category?: CatalogCategory
}

/** O que entrou de fato na grade — Favoritos ou uma categoria por id. */
type EnteredKey = { kind: 'favorites' } | { kind: 'category'; id: number }

function locate<T>(items: T[], matches: (item: T) => boolean): number {
  const idx = items.findIndex(matches)
  return idx === -1 ? 0 : idx
}

/**
 * Padrão sem navegação prévia: a primeira categoria REAL (índice 1 da
 * trilha), não "★ Favoritos" — mesma decisão de `LiveScreen.tsx`, pelo
 * mesmo motivo (a maioria não tem favorito nenhum ainda).
 */
function defaultTrailIdx(trail: TrailEntry[]): number {
  return Math.min(1, trail.length - 1)
}

export function MoviesScreen({ sourceId, onOpenMovie, onBack }: MoviesScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)
  const { toastMessage, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // Estrutura: rápida, nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'movie')
  const categories = categoriesQuery.data ?? []

  const trail: TrailEntry[] = [
    { key: { kind: 'favorites' } },
    ...categories.map((category) => ({
      key: { kind: 'category', name: groupLabel(category.name) } as TrailKey,
      category,
    })),
  ]

  const [focusedTrailKey, setFocusedTrailKey] = useState<TrailKey | null>(null)
  // Sem identidade ainda, OU identidade que sumiu de vez do catálogo novo:
  // cai na primeira categoria REAL, não em "Favoritos" (mesmo cuidado de
  // `LiveScreen.tsx` — `locate()` genérico não serve aqui, seu fallback é
  // sempre o índice 0, que agora é a entrada virtual).
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

  // Trilha de categorias não é virtualizada (D-004) e usa uma classe CSS
  // pra foco, não foco real de DOM — sem isto, o item focado descia pra
  // fora da área visível numa fonte com muitas categorias e ficava lá
  // (achado na TV física, feature 009, Cenário B — mesmo padrão da
  // LiveScreen).
  const focusedCategoryRef = useScrollFocusedIntoView<HTMLButtonElement>(categoryIdx)

  // Pré-busca a categoria em foco depois que o cursor para nela por um
  // instante — desvio deliberado de FR-004, ver LiveScreen.tsx e plan.md
  // R-013. "Favoritos" nunca prefetcha — `focusedCategory` fica `undefined`
  // quando ela está em foco, e o hook já ignora `undefined`.
  useCategoryFocusPrefetch(sourceId, focusedCategory)

  // "Entrada" — a categoria (ou Favoritos) que a pessoa comprometeu-se a
  // ver troca de coluna e exibe o conteúdo (em geral já pré-buscado, acima).
  const [entered, setEntered] = useState<EnteredKey | null>(null)
  const enteredCategory = entered?.kind === 'category' ? categories.find((c) => c.id === entered.id) : undefined
  const enteredFavorites = entered?.kind === 'favorites'

  const content = useCategoryContent(sourceId, enteredCategory)
  // A estrela precisa do conjunto de favoritos mesmo numa categoria comum,
  // não só dentro de "Favoritos" — consulta separada, sempre ativa.
  const favoriteIdsQuery = useFavoriteIds(sourceId, 'movie')
  const favoriteIds = favoriteIdsQuery.data ?? new Set<string>()
  // Só resolve favorito em registro do catálogo quando a pessoa ENTROU em
  // "Favoritos" (D-005 do plan.md: focar não gasta).
  const favoritesContent = useFavoritesContent(sourceId, 'movie', enteredFavorites)

  const movies = enteredFavorites ? (favoritesContent.data?.items ?? []) : (content.data?.items ?? [])
  const contentIsLoading = enteredFavorites ? favoritesContent.isLoading : content.isLoading
  const contentFailed = enteredFavorites
    ? favoritesContent.isError
    : content.data?.outcome === 'failed' || content.isError

  /**
   * O foco é guardado pela identidade do item, não pelo índice dele.
   *
   * Uma atualização em segundo plano pode publicar uma categoria menor
   * enquanto esta tela está aberta. Com um índice em estado, o de número 30
   * apontaria para o nada numa lista que passou a ter 5 — e o OK estouraria
   * ao derreferenciar `movies[30].id`. Pela identidade, o item ou é
   * reencontrado onde estiver agora, ou o foco cai no início.
   */
  const [focusedMovieId, setFocusedMovieId] = useState<string | null>(null)
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

  const moviesNavigable = col === 1 && !contentIsLoading && !contentFailed && movies.length > 0
  useVirtualFocusSync({
    focusedIndex: movieIdx,
    scrollToIndex: movieVirtualizer.scrollToIndex,
    enabled: moviesNavigable,
  })

  function enterCategory(category: CatalogCategory) {
    if (entered?.kind !== 'category' || entered.id !== category.id) {
      setEntered({ kind: 'category', id: category.id })
      // Trocar de categoria recomeça no primeiro item — a posição anterior
      // era de OUTRA categoria/de Favoritos, não é significativa aqui.
      setFocusedMovieId(null)
    }
    setCol(1)
  }

  function enterFavorites() {
    if (entered?.kind !== 'favorites') {
      setEntered({ kind: 'favorites' })
      setFocusedMovieId(null)
    }
    setCol(1)
  }

  function enterFocusedTrailItem() {
    if (isFavoritesFocused) enterFavorites()
    else if (focusedCategory) enterCategory(focusedCategory)
  }

  function retryContent() {
    if (enteredFavorites) void favoritesContent.refetch()
    else void content.refetch()
  }

  /**
   * Segurar OK favorita/desfavorita o filme focado (feature 013) — só na
   * grade, com um filme focado; nos demais casos `onLongSelect` fica
   * `undefined` e o OK volta a agir no keydown (abrir o detalhe), como
   * sempre agiu (D-002 do plan.md).
   */
  const canToggleFavorite = col === 1 && activeMovie !== undefined

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
      if (movies.length === 0) return
      const next = gridNextIndex(dir, movieIdx, movies.length, GRID_COLS)
      setFocusedMovieId(movies[next]?.id ?? null)
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
      const movie = movies[movieIdx]
      if (movie) onOpenMovie(movie.id)
    },
    onLongSelect: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onFavoriteKey: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onBack: () => {
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
  const contentStale = !enteredFavorites && showingContent && content.data?.outcome === 'stale-served'
  const truncated = !enteredFavorites && showingContent && (content.data?.totalCount ?? 0) > movies.length
  /**
   * O que o provedor prometeu e o que ele de fato entregou são fatos
   * distintos (D-005) — quando os dois existem e divergem, a tela declara
   * a diferença em vez de escondê-la (FR-015). Não se aplica a "Favoritos".
   */
  const declaredCount = focusedCategory?.declaredCount
  const realCount = content.data?.totalCount
  const countsDiverge =
    !enteredFavorites &&
    showingContent &&
    !content.isLoading &&
    declaredCount !== undefined &&
    realCount !== undefined &&
    declaredCount !== realCount
  const unresolvedFavorites = enteredFavorites ? (favoritesContent.data?.unresolved ?? 0) : 0

  return (
    <div className="screen screen-row">
      <h1 className="screen-title" style={{ display: 'none' }}>
        Filmes
      </h1>
      <div className="live-column live-column-groups">
        <div className="live-column-title">Filmes</div>
        <button
          key="favorites"
          ref={categoryIdx === 0 ? focusedCategoryRef : undefined}
          type="button"
          className={`live-item live-item-favorites${col === 0 && categoryIdx === 0 ? ' tv-focus' : ''}`}
        >
          <span aria-hidden="true">★</span>
          <span>Favoritos</span>
        </button>
        {categories.map((category, i) => (
          <button
            key={category.id}
            ref={categoryIdx === i + 1 ? focusedCategoryRef : undefined}
            type="button"
            className={`live-item${col === 0 && categoryIdx === i + 1 ? ' tv-focus' : ''}`}
          >
            {groupLabel(category.name)}
          </button>
        ))}
      </div>

      <div className="category-content">
        {!showingContent && (
          <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver os filmes.</div>
        )}

        {showingContent && contentIsLoading && (
          <div className="live-state">
            <div className="live-state-copy">Carregando filmes…</div>
            <button type="button" className="live-state-action tv-focus">
              Voltar
            </button>
          </div>
        )}

        {showingContent && !contentIsLoading && contentFailed && (
          <div className="live-state">
            <div className="live-state-title">Não foi possível carregar esta categoria</div>
            <button type="button" className="live-state-action tv-focus" onClick={retryContent}>
              Tentar de novo
            </button>
          </div>
        )}

        {showingContent && !contentIsLoading && !contentFailed && enteredFavorites && movies.length === 0 && (
          <FavoritesEmptyState kind="movie" focused onBack={() => setCol(0)} />
        )}

        {showingContent && !contentIsLoading && !contentFailed && !enteredFavorites && movies.length === 0 && (
          <div className="live-state-copy">Esta categoria está vazia.</div>
        )}

        {showingContent && contentStale && (
          <div className="live-truncated-note">
            Não foi possível atualizar agora — mostrando o que já estava salvo.
          </div>
        )}

        {countsDiverge && (
          <div className="live-truncated-note">
            O provedor declarou {declaredCount} filmes nesta categoria, mas entregou {realCount}.
          </div>
        )}

        {showingContent && !contentIsLoading && !contentFailed && enteredFavorites && (
          <FavoritesUnresolvedNote unresolved={unresolvedFavorites} />
        )}

        {showingContent && !contentIsLoading && !contentFailed && movies.length > 0 && (
          <FavoriteHint />
        )}

        {showingContent && !contentIsLoading && !contentFailed && movies.length > 0 && (
          <div ref={setContainerRef} className="poster-grid">
            <div className="poster-grid-inner" style={{ height: movieVirtualizer.getTotalSize() }}>
              {movieVirtualizer.getVirtualItems().map((virtualRow) => {
                const movie = movies[virtualRow.index]
                if (!movie) return null
                const isFavorite = favoriteIds.has(stableIdOf(movie) ?? '')
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
                    <div className={`poster-box${col === 1 && movieIdx === virtualRow.index ? ' tv-focus' : ''}`}>
                      <div className="poster-box-noise" />
                      <span className="poster-box-label">
                        pôster
                        <br />
                        {movie.name}
                      </span>
                      {isFavorite && (
                        <span className="fav-star" aria-hidden="true">
                          ★
                        </span>
                      )}
                    </div>
                    <div className="poster-card-title">{movie.name}</div>
                    <div className="poster-card-meta">{movie.original_group ?? 'Filme'}</div>
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

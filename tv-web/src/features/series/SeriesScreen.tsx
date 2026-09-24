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
import { FavoritesEmptyState, FavoritesUnresolvedNote } from '../favorites/FavoritesState'
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

export interface SeriesScreenProps {
  sourceId: string
  onOpenSeries: (seriesId: string) => void
  onBack: () => void
}

/**
 * A trilha de categorias (feature 013) é "★ Favoritos" seguida das
 * categorias declaradas pela fonte — mesmo modelo de `LiveScreen.tsx`/
 * `MoviesScreen.tsx` (D-004 do plan.md).
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
 * trilha), não "★ Favoritos" — mesma decisão de `LiveScreen.tsx`.
 */
function defaultTrailIdx(trail: TrailEntry[]): number {
  return Math.min(1, trail.length - 1)
}

export function SeriesScreen({ sourceId, onOpenSeries, onBack }: SeriesScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)
  const { toastMessage, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // Estrutura: rápida, nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'series')
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
  // `LiveScreen.tsx` — `locate()` genérico não serve aqui).
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
  // R-013. "Favoritos" nunca prefetcha.
  useCategoryFocusPrefetch(sourceId, focusedCategory)

  // "Entrada" — a categoria (ou Favoritos) que a pessoa comprometeu-se a
  // ver troca de coluna e exibe o conteúdo (em geral já pré-buscado, acima).
  const [entered, setEntered] = useState<EnteredKey | null>(null)
  const enteredCategory = entered?.kind === 'category' ? categories.find((c) => c.id === entered.id) : undefined
  const enteredFavorites = entered?.kind === 'favorites'

  const content = useCategoryContent(sourceId, enteredCategory)
  // A estrela precisa do conjunto de favoritos mesmo numa categoria comum.
  const favoriteIdsQuery = useFavoriteIds(sourceId, 'series')
  const favoriteIds = favoriteIdsQuery.data ?? new Set<string>()
  // Só resolve favorito em registro do catálogo quando a pessoa ENTROU em
  // "Favoritos" (D-005 do plan.md: focar não gasta).
  const favoritesContent = useFavoritesContent(sourceId, 'series', enteredFavorites)

  const series = enteredFavorites ? (favoritesContent.data?.items ?? []) : (content.data?.items ?? [])
  const contentIsLoading = enteredFavorites ? favoritesContent.isLoading : content.isLoading
  const contentFailed = enteredFavorites
    ? favoritesContent.isError
    : content.data?.outcome === 'failed' || content.isError

  // Foco por identidade, não por índice — ver a explicação em MoviesScreen:
  // uma atualização em segundo plano pode encurtar a lista debaixo do foco.
  const [focusedSeriesId, setFocusedSeriesId] = useState<string | null>(null)
  const seriesIdx = locate(series, (item) => item.id === focusedSeriesId)
  const activeSeries = series[seriesIdx]

  // Só o painel de conteúdo (col 1) é virtualizado — nunca a trilha de
  // categorias (D-004). Grade com `lanes: GRID_COLS`, nunca dois
  // virtualizadores compostos (D-005).
  const { columnWidth, setContainerRef, containerRef: gridContainerRef } = usePosterColumnWidth(GRID_COLS)
  const rowHeight = columnWidth * 1.5 + POSTER_ROW_EXTRA_PX

  const seriesVirtualizer = useVirtualizer({
    count: series.length,
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
    seriesVirtualizer.measure()
  }, [rowHeight, seriesVirtualizer])

  const seriesNavigable = col === 1 && !contentIsLoading && !contentFailed && series.length > 0
  useVirtualFocusSync({
    focusedIndex: seriesIdx,
    scrollToIndex: seriesVirtualizer.scrollToIndex,
    enabled: seriesNavigable,
  })

  function enterCategory(category: CatalogCategory) {
    if (entered?.kind !== 'category' || entered.id !== category.id) {
      setEntered({ kind: 'category', id: category.id })
      setFocusedSeriesId(null)
    }
    setCol(1)
  }

  function enterFavorites() {
    if (entered?.kind !== 'favorites') {
      setEntered({ kind: 'favorites' })
      setFocusedSeriesId(null)
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
   * Segurar OK favorita/desfavorita a série focada (feature 013) — só na
   * grade, com uma série focada; nos demais casos `onLongSelect` fica
   * `undefined` e o OK volta a agir no keydown (abrir o detalhe), como
   * sempre agiu (D-002 do plan.md).
   */
  const canToggleFavorite = col === 1 && activeSeries !== undefined

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

      if (dir === 'left' && seriesIdx % GRID_COLS === 0) {
        setCol(0)
        return
      }
      if (series.length === 0) return
      const next = gridNextIndex(dir, seriesIdx, series.length, GRID_COLS)
      setFocusedSeriesId(series[next]?.id ?? null)
    },
    onSelect: () => {
      if (col === 0) {
        enterFocusedTrailItem()
        return
      }
      // "Favoritos" vazia (FR-008): o único elemento acionável é o botão
      // "Voltar" do `FavoritesEmptyState` — sem isto, OK não faz nada aqui.
      if (enteredFavorites && !contentIsLoading && !contentFailed && series.length === 0) {
        setCol(0)
        return
      }
      const item = series[seriesIdx]
      if (item) onOpenSeries(item.id)
    },
    onLongSelect: canToggleFavorite
      ? () => {
          void favoriteToggle.toggle(activeSeries, {
            // Só dentro de "Favoritos" desfavoritar precisa mover o foco
            // pra fora do item — numa categoria comum, ele continua lá.
            visibleItems: enteredFavorites ? series : undefined,
            onFocusNeighbor: enteredFavorites ? setFocusedSeriesId : undefined,
          })
        }
      : undefined,
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
        <h1 className="screen-title">Séries</h1>
        <div className="live-state">
          {categoriesQuery.isLoading && <div className="live-state-copy">Carregando séries…</div>}
          {categoriesQuery.isError && (
            <>
              <div className="live-state-title">Não foi possível carregar as séries</div>
              <div className="live-state-copy">Tente novamente em instantes.</div>
            </>
          )}
          {!categoriesQuery.isLoading && !categoriesQuery.isError && (
            <>
              <div className="live-state-title">Nenhuma série nesta lista</div>
              <div className="live-state-copy">
                A importação pode não ter encontrado séries nesta fonte, ou ainda estar em
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
  const truncated = !enteredFavorites && showingContent && (content.data?.totalCount ?? 0) > series.length
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
        Séries
      </h1>
      <div className="live-column live-column-groups">
        <div className="live-column-title">Séries</div>
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
          <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver as séries.</div>
        )}

        {showingContent && contentIsLoading && (
          <div className="live-state">
            <div className="live-state-copy">Carregando séries…</div>
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

        {showingContent && !contentIsLoading && !contentFailed && enteredFavorites && series.length === 0 && (
          <FavoritesEmptyState kind="series" focused onBack={() => setCol(0)} />
        )}

        {showingContent && !contentIsLoading && !contentFailed && !enteredFavorites && series.length === 0 && (
          <div className="live-state-copy">Esta categoria está vazia.</div>
        )}

        {showingContent && contentStale && (
          <div className="live-truncated-note">
            Não foi possível atualizar agora — mostrando o que já estava salvo.
          </div>
        )}

        {countsDiverge && (
          <div className="live-truncated-note">
            O provedor declarou {declaredCount} séries nesta categoria, mas entregou {realCount}.
          </div>
        )}

        {showingContent && !contentIsLoading && !contentFailed && enteredFavorites && (
          <FavoritesUnresolvedNote unresolved={unresolvedFavorites} />
        )}

        {showingContent && !contentIsLoading && !contentFailed && series.length > 0 && (
          <div className="fav-hint">Segure OK para favoritar</div>
        )}

        {showingContent && !contentIsLoading && !contentFailed && series.length > 0 && (
          <div ref={setContainerRef} className="poster-grid">
            <div className="poster-grid-inner" style={{ height: seriesVirtualizer.getTotalSize() }}>
              {seriesVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = series[virtualRow.index]
                if (!item) return null
                const isFavorite = favoriteIds.has(stableIdOf(item) ?? '')
                return (
                  <div
                    key={item.id}
                    className="poster-cell"
                    style={{
                      left: `${(virtualRow.lane / GRID_COLS) * 100}%`,
                      width: `${100 / GRID_COLS}%`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className={`poster-box${col === 1 && seriesIdx === virtualRow.index ? ' tv-focus' : ''}`}>
                      <div className="poster-box-noise" />
                      <span className="poster-box-label">
                        pôster
                        <br />
                        {item.name}
                      </span>
                      {isFavorite && (
                        <span className="fav-star" aria-hidden="true">
                          ★
                        </span>
                      )}
                    </div>
                    <div className="poster-card-title">{item.name}</div>
                    <div className="poster-card-meta">{item.original_group ?? 'Série'}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {truncated && (
          <div className="live-truncated-note">
            Mostrando as primeiras {series.length} de {content.data?.totalCount} séries desta categoria.
          </div>
        )}
      </div>

      <Toast message={toastMessage} />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
} from '../catalog/catalogApi'
import { clamp, gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'
import { usePosterColumnWidth } from '../../lib/focus/usePosterColumnWidth'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'

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

function locate<T>(items: T[], matches: (item: T) => boolean): number {
  const idx = items.findIndex(matches)
  return idx === -1 ? 0 : idx
}

export function MoviesScreen({ sourceId, onOpenMovie, onBack }: MoviesScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)

  // Estrutura: rápida, nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'movie')
  const categories = categoriesQuery.data ?? []

  const [focusedCategoryName, setFocusedCategoryName] = useState<string | null>(null)
  const categoryIdx =
    focusedCategoryName === null
      ? 0
      : locate(categories, (c) => groupLabel(c.name) === focusedCategoryName)
  const focusedCategory = categories[categoryIdx]

  // Trilha de categorias não é virtualizada (D-004) e usa uma classe CSS
  // pra foco, não foco real de DOM — sem isto, o item focado descia pra
  // fora da área visível numa fonte com muitas categorias e ficava lá
  // (achado na TV física, feature 009, Cenário B — mesmo padrão da
  // LiveScreen).
  const focusedCategoryRef = useScrollFocusedIntoView<HTMLButtonElement>(categoryIdx)

  // Pré-busca a categoria em foco depois que o cursor para nela por um
  // instante — desvio deliberado de FR-004, ver LiveScreen.tsx e plan.md R-013.
  useCategoryFocusPrefetch(sourceId, focusedCategory)

  // "Entrada" — a categoria que a pessoa comprometeu-se a ver troca de
  // coluna e exibe o conteúdo (em geral já pré-buscado, acima).
  const [enteredCategoryId, setEnteredCategoryId] = useState<number | null>(null)
  const enteredCategory = categories.find((c) => c.id === enteredCategoryId)
  const content = useCategoryContent(sourceId, enteredCategory)
  const movies = content.data?.items ?? []

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

  const moviesNavigable =
    col === 1 && !content.isLoading && content.data?.outcome !== 'failed' && movies.length > 0
  useVirtualFocusSync({
    focusedIndex: movieIdx,
    scrollToIndex: movieVirtualizer.scrollToIndex,
    enabled: moviesNavigable,
  })

  function enter(category: (typeof categories)[number]) {
    if (enteredCategoryId !== category.id) {
      setEnteredCategoryId(category.id)
      // Trocar de categoria recomeça no primeiro item — a posição anterior
      // era de OUTRA categoria, não é significativa aqui.
      setFocusedMovieId(null)
    }
    setCol(1)
  }

  useRemoteNav({
    onDirection: (dir) => {
      if (col === 0) {
        if (dir === 'right' && focusedCategory) {
          enter(focusedCategory)
          return
        }
        if (dir === 'up' || dir === 'down') {
          const next = clamp(categoryIdx + (dir === 'down' ? 1 : -1), 0, categories.length - 1)
          if (next !== categoryIdx) {
            setFocusedCategoryName(groupLabel(categories[next]?.name))
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
        if (focusedCategory) enter(focusedCategory)
        return
      }
      const movie = movies[movieIdx]
      if (movie) onOpenMovie(movie.id)
    },
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
  // `content.isError`: a consulta em si lançou (ex.: erro de plataforma
  // fora do controle de `categoryLoader`) — sem isto, `movies` cai em `[]`
  // e a tela mostraria "categoria vazia" escondendo uma falha de verdade.
  const contentFailed = showingContent && (content.data?.outcome === 'failed' || content.isError)
  const contentStale = showingContent && content.data?.outcome === 'stale-served'
  const truncated = showingContent && (content.data?.totalCount ?? 0) > movies.length
  /**
   * O que o provedor prometeu e o que ele de fato entregou são fatos
   * distintos (D-005) — quando os dois existem e divergem, a tela declara
   * a diferença em vez de escondê-la (FR-015).
   */
  const declaredCount = focusedCategory?.declaredCount
  const realCount = content.data?.totalCount
  const countsDiverge =
    showingContent &&
    !content.isLoading &&
    declaredCount !== undefined &&
    realCount !== undefined &&
    declaredCount !== realCount

  return (
    <div className="screen screen-row">
      <h1 className="screen-title" style={{ display: 'none' }}>
        Filmes
      </h1>
      <div className="live-column live-column-groups">
        <div className="live-column-title">Filmes</div>
        {categories.map((category, i) => (
          <button
            key={category.id}
            ref={categoryIdx === i ? focusedCategoryRef : undefined}
            type="button"
            className={`live-item${col === 0 && categoryIdx === i ? ' tv-focus' : ''}`}
          >
            {groupLabel(category.name)}
          </button>
        ))}
      </div>

      <div className="category-content">
        {!showingContent && (
          <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver os filmes.</div>
        )}

        {showingContent && content.isLoading && (
          <div className="live-state">
            <div className="live-state-copy">Carregando filmes…</div>
            <button type="button" className="live-state-action tv-focus">
              Voltar
            </button>
          </div>
        )}

        {showingContent && contentFailed && (
          <div className="live-state">
            <div className="live-state-title">Não foi possível carregar esta categoria</div>
            <button
              type="button"
              className="live-state-action tv-focus"
              onClick={() => void content.refetch()}
            >
              Tentar de novo
            </button>
          </div>
        )}

        {showingContent && !content.isLoading && !contentFailed && movies.length === 0 && (
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

        {showingContent && !content.isLoading && !contentFailed && movies.length > 0 && (
          <div ref={setContainerRef} className="poster-grid">
            <div className="poster-grid-inner" style={{ height: movieVirtualizer.getTotalSize() }}>
              {movieVirtualizer.getVirtualItems().map((virtualRow) => {
                const movie = movies[virtualRow.index]
                if (!movie) return null
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
    </div>
  )
}

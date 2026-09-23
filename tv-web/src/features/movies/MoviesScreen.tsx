import { useState } from 'react'
import {
  groupLabel,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
} from '../catalog/catalogApi'
import { clamp, gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'

const GRID_COLS = 6

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
  const contentFailed = showingContent && content.data?.outcome === 'failed'
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
          <div className="poster-grid">
            {movies.map((movie, i) => (
              <div key={movie.id}>
                <div className={`poster-box${col === 1 && movieIdx === i ? ' tv-focus' : ''}`}>
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
            ))}
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

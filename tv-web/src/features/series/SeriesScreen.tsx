import { useState } from 'react'
import {
  groupLabel,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
} from '../catalog/catalogApi'
import { clamp, gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'

const GRID_COLS = 6

export interface SeriesScreenProps {
  sourceId: string
  onOpenSeries: (seriesId: string) => void
  onBack: () => void
}

function locate<T>(items: T[], matches: (item: T) => boolean): number {
  const idx = items.findIndex(matches)
  return idx === -1 ? 0 : idx
}

export function SeriesScreen({ sourceId, onOpenSeries, onBack }: SeriesScreenProps) {
  const [col, setCol] = useState<0 | 1>(0)

  // Estrutura: rápida, nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, 'series')
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
  const series = content.data?.items ?? []

  // Foco por identidade, não por índice — ver a explicação em MoviesScreen:
  // uma atualização em segundo plano pode encurtar a lista debaixo do foco.
  const [focusedSeriesId, setFocusedSeriesId] = useState<string | null>(null)
  const seriesIdx = locate(series, (item) => item.id === focusedSeriesId)

  function enter(category: (typeof categories)[number]) {
    if (enteredCategoryId !== category.id) {
      setEnteredCategoryId(category.id)
      setFocusedSeriesId(null)
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
        if (focusedCategory) enter(focusedCategory)
        return
      }
      const item = series[seriesIdx]
      if (item) onOpenSeries(item.id)
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
  const contentFailed = showingContent && content.data?.outcome === 'failed'
  const contentStale = showingContent && content.data?.outcome === 'stale-served'
  const truncated = showingContent && (content.data?.totalCount ?? 0) > series.length
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
        Séries
      </h1>
      <div className="live-column live-column-groups">
        <div className="live-column-title">Séries</div>
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
          <div className="live-state-copy">Aponte para uma categoria e pressione OK para ver as séries.</div>
        )}

        {showingContent && content.isLoading && (
          <div className="live-state">
            <div className="live-state-copy">Carregando séries…</div>
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

        {showingContent && !content.isLoading && !contentFailed && series.length === 0 && (
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

        {showingContent && !content.isLoading && !contentFailed && series.length > 0 && (
          <div className="poster-grid">
            {series.map((item, i) => (
              <div key={item.id}>
                <div className={`poster-box${col === 1 && seriesIdx === i ? ' tv-focus' : ''}`}>
                  <div className="poster-box-noise" />
                  <span className="poster-box-label">
                    pôster
                    <br />
                    {item.name}
                  </span>
                </div>
                <div className="poster-card-title">{item.name}</div>
                <div className="poster-card-meta">{item.original_group ?? 'Série'}</div>
              </div>
            ))}
          </div>
        )}

        {truncated && (
          <div className="live-truncated-note">
            Mostrando as primeiras {series.length} de {content.data?.totalCount} séries desta categoria.
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useSeries } from '../catalog/catalogApi'
import { gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'

const GRID_COLS = 6

export interface SeriesScreenProps {
  sourceId: string
  onOpenSeries: (seriesId: string) => void
  onBack: () => void
}

export function SeriesScreen({ sourceId, onOpenSeries, onBack }: SeriesScreenProps) {
  const query = useSeries(sourceId)
  const series = query.data?.items ?? []

  // Foco por identidade, não por índice — ver a explicação em MoviesScreen:
  // uma atualização em segundo plano pode encurtar a lista debaixo do foco.
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const located = series.findIndex((item) => item.id === focusedId)
  const focus = located === -1 ? 0 : located

  useRemoteNav({
    onDirection: (dir) => {
      if (series.length === 0) return
      const next = gridNextIndex(dir, focus, series.length, GRID_COLS)
      setFocusedId(series[next]?.id ?? null)
    },
    onSelect: () => {
      const item = series[focus]
      if (item) onOpenSeries(item.id)
    },
    onBack,
  })

  if (query.isLoading || query.isError || series.length === 0) {
    // Todo estado precisa de saída focável, ou o controle fica preso
    // (constitution, "Foco Visível e Sem Becos Sem Saída").
    return (
      <div className="screen">
        <h1 className="screen-title">Séries</h1>
        <div className="live-state">
          {query.isLoading && <div className="live-state-copy">Carregando séries…</div>}
          {query.isError && (
            <>
              <div className="live-state-title">Não foi possível carregar as séries</div>
              <div className="live-state-copy">Tente novamente em instantes.</div>
            </>
          )}
          {!query.isLoading && !query.isError && (
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

  const truncated = (query.data?.total_count ?? 0) > series.length

  return (
    <div className="screen">
      <h1 className="screen-title">Séries</h1>
      <div className="poster-grid">
        {series.map((item, i) => (
          <div key={item.id}>
            <div className={`poster-box${focus === i ? ' tv-focus' : ''}`}>
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
      {truncated && (
        <div className="live-truncated-note">
          Mostrando as primeiras {series.length} de {query.data?.total_count} séries desta lista.
        </div>
      )}
    </div>
  )
}

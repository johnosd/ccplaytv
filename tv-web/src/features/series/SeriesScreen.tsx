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
  const [focus, setFocus] = useState(0)
  const query = useSeries(sourceId)
  const series = query.data?.items ?? []

  useRemoteNav({
    onDirection: (dir) =>
      setFocus((current) => gridNextIndex(dir, current, series.length, GRID_COLS)),
    onSelect: () => {
      if (series.length > 0) onOpenSeries(series[focus].id)
    },
    onBack,
  })

  return (
    <div className="screen">
      <h1 className="screen-title">Séries</h1>
      <div className="poster-grid">
        {series.map((s, i) => (
          <div key={s.id}>
            <div className={`poster-box${focus === i ? ' tv-focus' : ''}`}>
              <div className="poster-box-noise" />
              <span className="poster-box-label">
                pôster
                <br />
                {s.name}
              </span>
            </div>
            <div className="poster-card-title">{s.name}</div>
            <div className="poster-card-meta">
              {s.original_group ?? 'Série'}
            </div>
          </div>
        ))}
        {series.length === 0 && <div style={{ padding: 40 }}>Nenhuma série encontrada.</div>}
      </div>
    </div>
  )
}

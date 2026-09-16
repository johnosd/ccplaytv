import { useState } from 'react'
import { SERIES } from '../catalog/mockCatalog'
import { gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'

const GRID_COLS = 6

export interface SeriesScreenProps {
  onOpenSeries: (seriesId: string) => void
  onBack: () => void
}

export function SeriesScreen({ onOpenSeries, onBack }: SeriesScreenProps) {
  const [focus, setFocus] = useState(0)

  useRemoteNav({
    onDirection: (dir) =>
      setFocus((current) => gridNextIndex(dir, current, SERIES.length, GRID_COLS)),
    onSelect: () => onOpenSeries(SERIES[focus].id),
    onBack,
  })

  return (
    <div className="screen">
      <h1 className="screen-title">Séries</h1>
      <div className="poster-grid">
        {SERIES.map((series, i) => (
          <div key={series.id}>
            <div className={`poster-box${focus === i ? ' tv-focus' : ''}`}>
              <div className="poster-box-noise" />
              <span className="poster-box-label">
                pôster
                <br />
                {series.title}
              </span>
            </div>
            <div className="poster-card-title">{series.title}</div>
            <div className="poster-card-meta">{series.genre}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

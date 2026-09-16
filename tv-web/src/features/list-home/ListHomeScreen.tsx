import { useState } from 'react'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'

export type ListDestination = 'live' | 'movies' | 'series'

export interface ListHomeScreenProps {
  sourceName: string
  movieCount: number
  seriesCount: number
  onSelect: (destination: ListDestination) => void
  onBack: () => void
}

const TILES: { key: ListDestination; icon: string; label: string }[] = [
  { key: 'live', icon: '📡', label: 'Live TV' },
  { key: 'movies', icon: '🎬', label: 'Filmes' },
  { key: 'series', icon: '🎞️', label: 'Séries' },
]

export function ListHomeScreen({
  sourceName,
  movieCount,
  seriesCount,
  onSelect,
  onBack,
}: ListHomeScreenProps) {
  const [focusCol, setFocusCol] = useState(0)

  useRemoteNav({
    onDirection: (dir) => {
      if (dir === 'left') setFocusCol((c) => clamp(c - 1, 0, TILES.length - 1))
      if (dir === 'right') setFocusCol((c) => clamp(c + 1, 0, TILES.length - 1))
    },
    onSelect: () => onSelect(TILES[focusCol].key),
    onBack,
  })

  const tileMeta: Record<ListDestination, string> = {
    live: 'Canais em tempo real',
    movies: `${movieCount} títulos`,
    series: `${seriesCount} títulos`,
  }

  return (
    <div className="screen">
      <p className="screen-eyebrow">{sourceName}</p>
      <h1 className="screen-title" style={{ marginBottom: 64 }}>
        O que você quer assistir?
      </h1>
      <div className="tiles-row">
        {TILES.map((tile, i) => (
          <div key={tile.key} className={`tile${focusCol === i ? ' tv-focus' : ''}`}>
            <div className="tile-icon">{tile.icon}</div>
            <div className="tile-label">{tile.label}</div>
            <div className="tile-meta">{tileMeta[tile.key]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

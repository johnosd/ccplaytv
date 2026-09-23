import { useState } from 'react'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useCatalogCounts } from '../catalog/catalogApi'

export type ListDestination = 'live' | 'movies' | 'series'

export interface ListHomeScreenProps {
  sourceId: string
  sourceName: string
  onSelect: (destination: ListDestination) => void
  onBack: () => void
}

const TILES: { key: ListDestination; icon: string; label: string }[] = [
  { key: 'live', icon: '📡', label: 'Live TV' },
  { key: 'movies', icon: '🎬', label: 'Filmes' },
  { key: 'series', icon: '🎞️', label: 'Séries' },
]

export function ListHomeScreen({ sourceId, sourceName, onSelect, onBack }: ListHomeScreenProps) {
  const [focusCol, setFocusCol] = useState(0)
  const counts = useCatalogCounts(sourceId)

  useRemoteNav({
    onDirection: (dir) => {
      if (dir === 'left') setFocusCol((c) => clamp(c - 1, 0, TILES.length - 1))
      if (dir === 'right') setFocusCol((c) => clamp(c + 1, 0, TILES.length - 1))
    },
    onSelect: () => onSelect(TILES[focusCol].key),
    onBack,
  })

  // Número só aparece quando é o número real desta lista. Enquanto a
  // contagem não chega, o lugar dela fica vazio — um valor de outra origem
  // ali seria dado inventado apresentado como do catálogo.
  const titles = (value: number | undefined): string =>
    value === undefined ? '' : `${value} ${value === 1 ? 'título' : 'títulos'}`

  const tileMeta: Record<ListDestination, string> = {
    live: 'Canais em tempo real',
    movies: titles(counts.data?.movies),
    series: titles(counts.data?.series),
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

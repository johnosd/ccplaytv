import { useState } from 'react'
import { MOVIES } from '../catalog/mockCatalog'
import { gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'

const GRID_COLS = 6

export interface MoviesScreenProps {
  onOpenMovie: (movieId: string) => void
  onBack: () => void
}

export function MoviesScreen({ onOpenMovie, onBack }: MoviesScreenProps) {
  const [focus, setFocus] = useState(0)

  useRemoteNav({
    onDirection: (dir) =>
      setFocus((current) => gridNextIndex(dir, current, MOVIES.length, GRID_COLS)),
    onSelect: () => onOpenMovie(MOVIES[focus].id),
    onBack,
  })

  return (
    <div className="screen">
      <h1 className="screen-title">Filmes</h1>
      <div className="poster-grid">
        {MOVIES.map((movie, i) => (
          <div key={movie.id}>
            <div className={`poster-box${focus === i ? ' tv-focus' : ''}`}>
              <div className="poster-box-noise" />
              <span className="poster-box-label">
                pôster
                <br />
                {movie.title}
              </span>
            </div>
            <div className="poster-card-title">{movie.title}</div>
            <div className="poster-card-meta">
              {movie.year} - {movie.genre}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

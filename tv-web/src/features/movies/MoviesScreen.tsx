import { useState } from 'react'
import { useMovies } from '../catalog/catalogApi'
import { gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'

const GRID_COLS = 6

export interface MoviesScreenProps {
  sourceId: string
  onOpenMovie: (movieId: string) => void
  onBack: () => void
}

export function MoviesScreen({ sourceId, onOpenMovie, onBack }: MoviesScreenProps) {
  const [focus, setFocus] = useState(0)
  const query = useMovies(sourceId)
  const movies = query.data?.items ?? []

  useRemoteNav({
    onDirection: (dir) =>
      setFocus((current) => gridNextIndex(dir, current, movies.length, GRID_COLS)),
    onSelect: () => {
      if (movies.length > 0) onOpenMovie(movies[focus].id)
    },
    onBack,
  })

  return (
    <div className="screen">
      <h1 className="screen-title">Filmes</h1>
      <div className="poster-grid">
        {movies.map((movie, i) => (
          <div key={movie.id}>
            <div className={`poster-box${focus === i ? ' tv-focus' : ''}`}>
              <div className="poster-box-noise" />
              <span className="poster-box-label">
                pôster
                <br />
                {movie.name}
              </span>
            </div>
            <div className="poster-card-title">{movie.name}</div>
            <div className="poster-card-meta">
              {movie.original_group ?? 'Filme'}
            </div>
          </div>
        ))}
        {movies.length === 0 && <div style={{ padding: 40 }}>Nenhum filme encontrado.</div>}
      </div>
    </div>
  )
}

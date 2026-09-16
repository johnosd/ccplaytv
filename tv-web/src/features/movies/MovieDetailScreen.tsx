import { useState } from 'react'
import { MOVIES } from '../catalog/mockCatalog'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'

export interface MovieDetailScreenProps {
  movieId: string
  onBack: () => void
}

export function MovieDetailScreen({ movieId, onBack }: MovieDetailScreenProps) {
  const movie = MOVIES.find((m) => m.id === movieId) ?? MOVIES[0]
  const [focus, setFocus] = useState<0 | 1>(0)
  const { toastMessage, showToast } = useToast()

  useRemoteNav({
    onDirection: (dir) => {
      if (dir === 'left') setFocus(0)
      if (dir === 'right') setFocus(1)
    },
    onSelect: () => showToast(focus === 0 ? 'Reproduzindo trailer...' : 'Abrindo player...'),
    onBack,
  })

  return (
    <div className="movie-detail-layout">
      <div className="movie-detail-backdrop">
        <div className="backdrop-noise" />
        <span className="backdrop-caption">backdrop / still do filme</span>
      </div>
      <div className="movie-detail-body">
        <div className="movie-detail-title">{movie.title}</div>
        <div className="movie-detail-meta">
          {movie.year} - {movie.genre} - {movie.dur} - Classificação {movie.rating}
        </div>
        <p className="movie-detail-synopsis">{movie.synopsis}</p>
        <div className="movie-detail-cast">Elenco: {movie.cast}</div>
        <div className="movie-detail-actions">
          <div className={`detail-button${focus === 0 ? ' tv-focus' : ''}`}>▶ Trailer</div>
          <div className={`detail-button${focus === 1 ? ' tv-focus' : ''}`}>▶ Assistir</div>
        </div>
      </div>
      <Toast message={toastMessage} />
    </div>
  )
}

import { useState } from 'react'
import { useMovies } from '../catalog/catalogApi'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'

export interface MovieDetailScreenProps {
  sourceId: string
  movieId: string
  onBack: () => void
}

export function MovieDetailScreen({ sourceId, movieId, onBack }: MovieDetailScreenProps) {
  const query = useMovies(sourceId)
  const movie = query.data?.items?.find((m) => m.id === movieId)
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

  if (!movie) return <div className="screen" style={{ padding: 40 }}>Carregando...</div>

  return (
    <div className="movie-detail-layout">
      <div className="movie-detail-backdrop">
        <div className="backdrop-noise" />
        <span className="backdrop-caption">backdrop / still do filme</span>
      </div>
      <div className="movie-detail-body">
        <div className="movie-detail-title">{movie.name}</div>
        <div className="movie-detail-meta">
          {movie.original_group ?? 'VOD'} - {movie.playable ? 'Disponível' : 'Indisponível'}
        </div>
        <p className="movie-detail-synopsis">Resumo não disponível na extração M3U/Xtream nativa.</p>
        <div className="movie-detail-cast">Elenco: Desconhecido</div>
        <div className="movie-detail-actions">
          <div className={`detail-button${focus === 0 ? ' tv-focus' : ''}`}>▶ Trailer</div>
          <div className={`detail-button${focus === 1 ? ' tv-focus' : ''}`}>▶ Assistir</div>
        </div>
      </div>
      <Toast message={toastMessage} />
    </div>
  )
}

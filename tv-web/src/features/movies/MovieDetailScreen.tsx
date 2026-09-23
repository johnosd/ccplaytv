import { useState } from 'react'
import { useCatalogItem } from '../catalog/catalogApi'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'

export interface MovieDetailScreenProps {
  movieId: string
  onBack: () => void
}

export function MovieDetailScreen({ movieId, onBack }: MovieDetailScreenProps) {
  // Pelo id, direto na chave primária. Carregar a lista de filmes inteira só
  // para procurar um item dentro dela custava o catálogo todo — e deixava de
  // encontrar qualquer filme além do teto de leitura da listagem.
  const query = useCatalogItem(movieId)
  const movie = query.data ?? undefined
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

  if (!movie) {
    // Carregando e "não existe mais" precisam dos dois de uma saída focável.
    return (
      <div className="screen">
        <div className="live-state">
          <div className="live-state-copy">
            {query.isLoading ? 'Carregando…' : 'Este filme não está mais no catálogo.'}
          </div>
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

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

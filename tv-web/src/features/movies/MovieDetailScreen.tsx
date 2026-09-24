import { useState } from 'react'
import { useCatalogItem } from '../catalog/catalogApi'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { PlayerLayer } from '../../components/PlayerLayer'

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
  // O foco inicial é sempre a ação primária (Assistir, índice 1) — FR-015 e
  // `logic/reproducao-vod.md` §5. Antes desta feature o foco nascia em
  // Trailer (índice 0); ajustado porque a ação primária de um filme é
  // assistir, não o trailer.
  const [focus, setFocus] = useState<0 | 1>(1)
  // Guarda de sessão única (FR-010): `{playing && <PlayerLayer/>}` já impede
  // duas camadas montadas ao mesmo tempo, e o `if (playing) return` abaixo
  // cobre o instante entre um SELECT repetido e o re-render que monta a
  // camada (mesmo padrão de `LiveScreen.tsx`).
  const [playing, setPlaying] = useState(false)
  const { toastMessage, showToast } = useToast()

  useRemoteNav({
    onDirection: (dir) => {
      if (!movie) return
      if (dir === 'left') setFocus(0)
      if (dir === 'right') setFocus(1)
    },
    onSelect: () => {
      // Estado de carregando/erro tem uma única saída ("Voltar") — sem isto,
      // OK do controle físico não a ativa, só o mouse (achado R-005, feature
      // 010; corrigido aqui localmente, sem tocar `useRemoteNav` global).
      if (!movie) {
        onBack()
        return
      }
      if (focus === 0) {
        // Trailer não é escopo desta feature (item 32 do backlog) — placeholder
        // mantido como já estava, intocado.
        showToast('Reproduzindo trailer...')
        return
      }
      if (playing) return
      setPlaying(true)
    },
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
      {playing && <PlayerLayer itemId={movieId} title={movie.name} onClose={() => setPlaying(false)} />}
    </div>
  )
}

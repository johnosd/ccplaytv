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
  const query = useMovies(sourceId)
  const movies = query.data?.items ?? []

  /**
   * O foco é guardado pela identidade do item, não pelo índice dele.
   *
   * Uma atualização em segundo plano pode publicar um catálogo menor
   * enquanto esta tela está aberta (`App` invalida `catalog-items` ao fim da
   * importação). Com um índice em estado, o de número 30 apontaria para o
   * nada numa lista que passou a ter 5 — e o OK estouraria ao derreferenciar
   * `movies[30].id`. Pela identidade, o item ou é reencontrado onde estiver
   * agora, ou o foco cai no início.
   */
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const located = movies.findIndex((movie) => movie.id === focusedId)
  const focus = located === -1 ? 0 : located

  useRemoteNav({
    onDirection: (dir) => {
      if (movies.length === 0) return
      const next = gridNextIndex(dir, focus, movies.length, GRID_COLS)
      setFocusedId(movies[next]?.id ?? null)
    },
    onSelect: () => {
      const movie = movies[focus]
      if (movie) onOpenMovie(movie.id)
    },
    onBack,
  })

  if (query.isLoading || query.isError || movies.length === 0) {
    // Todo estado precisa de saída focável, ou o controle fica preso
    // (constitution, "Foco Visível e Sem Becos Sem Saída").
    return (
      <div className="screen">
        <h1 className="screen-title">Filmes</h1>
        <div className="live-state">
          {query.isLoading && <div className="live-state-copy">Carregando filmes…</div>}
          {query.isError && (
            <>
              <div className="live-state-title">Não foi possível carregar os filmes</div>
              <div className="live-state-copy">Tente novamente em instantes.</div>
            </>
          )}
          {!query.isLoading && !query.isError && (
            <>
              <div className="live-state-title">Nenhum filme nesta lista</div>
              <div className="live-state-copy">
                A importação pode não ter encontrado filmes nesta fonte, ou ainda estar em
                andamento.
              </div>
            </>
          )}
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const truncated = (query.data?.total_count ?? 0) > movies.length

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
            <div className="poster-card-meta">{movie.original_group ?? 'Filme'}</div>
          </div>
        ))}
      </div>
      {truncated && (
        // Fala do limite de exibição, não do tamanho da fonte — a distinção
        // importa porque o catálogo publicado pode ser parcial (FR-016).
        <div className="live-truncated-note">
          Mostrando os primeiros {movies.length} de {query.data?.total_count} filmes desta lista.
        </div>
      )}
    </div>
  )
}

import { useCatalogItem } from '../catalog/catalogApi'
import { useRemoteNav } from '../../lib/useRemoteNav'

export interface SeriesDetailScreenProps {
  seriesId: string
  onBack: () => void
}

/**
 * Detalhe de uma série.
 *
 * **Temporadas e episódios ainda não são carregados.** O painel os entrega
 * por `get_series_info` (já implementado em `fetchSeriesInfo`), mas o
 * episódio não existe no catálogo local, e sem isso não há de onde montar a
 * URL de reprodução nem onde guardar retomada por temporada/episódio — é o
 * item 10 do backlog, não um detalhe de tela.
 *
 * Até lá esta tela diz o que tem e o que não tem, em vez de fingir uma
 * temporada com um episódio de mentira. O que ela não pode é ser um beco sem
 * saída: a saída focável é obrigatória em todos os estados.
 */
export function SeriesDetailScreen({ seriesId, onBack }: SeriesDetailScreenProps) {
  const query = useCatalogItem(seriesId)
  const series = query.data ?? undefined

  useRemoteNav({ onBack })

  if (!series) {
    return (
      <div className="screen">
        <div className="live-state">
          <div className="live-state-copy">
            {query.isLoading ? 'Carregando…' : 'Esta série não está mais no catálogo.'}
          </div>
          <button type="button" className="live-state-action tv-focus" onClick={onBack}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1 className="screen-title">{series.name}</h1>
      <p className="screen-subtitle">{series.original_group ?? 'Série'}</p>

      <div className="live-state">
        <div className="live-state-title">Episódios ainda não disponíveis</div>
        <div className="live-state-copy">
          Esta lista traz a série, mas ainda não os episódios dela. Os canais e os filmes desta
          fonte continuam funcionando normalmente.
        </div>
        <button type="button" className="live-state-action tv-focus" onClick={onBack}>
          Voltar
        </button>
      </div>
    </div>
  )
}

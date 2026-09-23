import { useState } from 'react'
import { useSeries } from '../catalog/catalogApi'
import { useRemoteNav } from '../../lib/useRemoteNav'

export interface SeriesDetailScreenProps {
  sourceId: string
  seriesId: string
  onBack: () => void
}

export function SeriesDetailScreen({ sourceId, seriesId, onBack }: SeriesDetailScreenProps) {
  const query = useSeries(sourceId)
  const series = query.data?.items?.find((s) => s.id === seriesId)
  
  // O Mock tinha suporte a temporadas e episódios (mockCatalog.ts).
  // Para VOD real, precisamos da chamada fetchSeriesInfo (Feature 006).
  // Por enquanto, mostraremos o layout básico.
  const [focusArea, setFocusArea] = useState<'seasons' | 'episodes'>('seasons')

  useRemoteNav({
    onDirection: (dir) => {
      // Navegação mock simplificada
      if (dir === 'left' && focusArea === 'episodes') setFocusArea('seasons')
      if (dir === 'right' && focusArea === 'seasons') setFocusArea('episodes')
    },
    onSelect: () => {},
    onBack,
  })

  if (!series) return <div className="screen" style={{ padding: 40 }}>Carregando...</div>

  return (
    <div className="series-detail-layout">
      <div className="series-detail-hero">
        <div className="series-detail-hero-backdrop">
          <div className="backdrop-noise" />
        </div>
        <div className="series-detail-hero-content">
          <h1 className="series-detail-title">{series.name}</h1>
          <div className="series-detail-meta">
            {series.original_group ?? 'Série'}
          </div>
          <p className="series-detail-synopsis">
            Detalhes e episódios on-demand a serem integrados via fetchSeriesInfo.
          </p>
        </div>
      </div>

      <div className="series-detail-browser">
        <div className={`series-detail-seasons${focusArea === 'seasons' ? ' is-active' : ''}`}>
          <div className="season-item tv-focus">Temporada 1</div>
        </div>
        <div className={`series-detail-episodes${focusArea === 'episodes' ? ' is-active' : ''}`}>
           <div className="episode-item">Episódios virão de fetchSeriesInfo()</div>
        </div>
      </div>
    </div>
  )
}

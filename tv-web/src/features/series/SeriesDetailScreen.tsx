import { useState } from 'react'
import { SERIES } from '../catalog/mockCatalog'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'

export interface SeriesDetailScreenProps {
  seriesId: string
  onBack: () => void
}

export function SeriesDetailScreen({ seriesId, onBack }: SeriesDetailScreenProps) {
  const series = SERIES.find((s) => s.id === seriesId) ?? SERIES[0]
  const [seasonIdx, setSeasonIdx] = useState(0)
  const [inEpisodeList, setInEpisodeList] = useState(false)
  const [episodeCol, setEpisodeCol] = useState(0)
  const { toastMessage, showToast } = useToast()

  const season = series.seasons[seasonIdx]

  useRemoteNav({
    onDirection: (dir) => {
      if ((dir === 'left' || dir === 'right') && !inEpisodeList) {
        setSeasonIdx((i) => clamp(i + (dir === 'right' ? 1 : -1), 0, series.seasons.length - 1))
        setEpisodeCol(0)
        return
      }
      if (dir === 'down') {
        if (!inEpisodeList) {
          setInEpisodeList(true)
          return
        }
        setEpisodeCol((c) => clamp(c + 1, 0, season.episodes.length - 1))
        return
      }
      if (dir === 'up' && inEpisodeList) {
        if (episodeCol > 0) setEpisodeCol((c) => c - 1)
        else setInEpisodeList(false)
      }
    },
    onSelect: () => {
      if (inEpisodeList) showToast('Abrindo player do episódio...')
    },
    onBack,
  })

  return (
    <div className="screen">
      <div className="series-detail-header">
        <div className="series-detail-thumb">
          <div className="backdrop-noise" />
        </div>
        <div className="series-detail-info">
          <div className="series-detail-title">{series.title}</div>
          <p className="series-detail-synopsis">{series.synopsis}</p>
          <div className="series-detail-cast">Elenco: {series.cast}</div>
        </div>
      </div>

      <div className="season-tabs">
        {series.seasons.map((s, i) => (
          <div
            key={s.name}
            className={`season-tab${!inEpisodeList && seasonIdx === i ? ' tv-focus' : ''}`}
            aria-selected={seasonIdx === i}
          >
            {s.name}
          </div>
        ))}
      </div>

      <div className="episode-list">
        {season.episodes.map((ep, i) => (
          <div
            key={ep.title}
            className={`episode-row${inEpisodeList && episodeCol === i ? ' tv-focus' : ''}`}
          >
            <div className="episode-thumb" />
            <div>
              <div className="episode-title">{ep.title}</div>
              <div className="episode-meta">
                {ep.dur} — {ep.synopsis}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Toast message={toastMessage} />
    </div>
  )
}

import type { ReactNode } from 'react'
import { useT } from '../lib/i18n/I18nProvider'
import type { MessageKey } from '../lib/i18n/messages/pt'
import type { PlaybackTechnicalInfo } from '../lib/player/playbackDiagnosis'

const CATEGORY_LABEL_KEY: Record<PlaybackTechnicalInfo['category'], MessageKey> = {
  network: 'player.errorInfo.category.network',
  format: 'player.errorInfo.category.format',
  source: 'player.errorInfo.category.source',
  unknown: 'player.errorInfo.category.unknown',
}

const MEDIA_LABEL_KEY: Record<PlaybackTechnicalInfo['mediaKind'], MessageKey> = {
  channel: 'player.errorInfo.media.channel',
  movie: 'player.errorInfo.media.movie',
  episode: 'player.errorInfo.media.episode',
  series: 'player.errorInfo.media.series',
  unclassified: 'player.errorInfo.media.unclassified',
  unknown: 'player.errorInfo.media.unknown',
}

function formatTime(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export interface PlayerErrorInfoPanelProps {
  info: PlaybackTechnicalInfo
}

/**
 * "Info técnica" do erro de reprodução (feature 042, FR-014, US2/AC4): só os
 * cinco campos sanitizados do diagnóstico — código, causa, mídia, motor e hora.
 * Nunca URL, host, usuário, senha nem o erro cru do motor. Estado do próprio
 * `PlayerLayer` (não um `Modal`: a camada captura o teclado); OK/RETURN fecham.
 * Mesmo visual do painel "Info do stream" (feature 029).
 */
export function PlayerErrorInfoPanel({ info }: PlayerErrorInfoPanelProps): ReactNode {
  const t = useT()
  const rows: Array<[string, string]> = [
    [t('player.errorInfo.code'), info.code],
    [t('player.errorInfo.cause'), t(CATEGORY_LABEL_KEY[info.category])],
    [t('player.errorInfo.media'), t(MEDIA_LABEL_KEY[info.mediaKind])],
    [t('player.errorInfo.engine'), info.engine],
    [t('player.errorInfo.time'), formatTime(info.at)],
  ]
  return (
    <div className="modal-overlay">
      <div className="modal-panel player-panel no-scrollbar" role="dialog" aria-modal="true" aria-label={t('player.errorInfo.dialog')}>
        <h2 className="modal-title">{t('player.errorInfo.title')}</h2>
        <dl className="player-info-list">
          {rows.map(([label, value]) => (
            <div key={label} className="player-info-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="modal-actions">
          <button type="button" className="player-action tv-focus">
            {t('player.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

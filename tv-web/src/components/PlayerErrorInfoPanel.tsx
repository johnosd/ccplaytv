import type { ReactNode } from 'react'
import type { PlaybackTechnicalInfo } from '../lib/player/playbackDiagnosis'

const CATEGORY_LABEL: Record<PlaybackTechnicalInfo['category'], string> = {
  network: 'Rede',
  format: 'Formato',
  source: 'Fonte',
  unknown: 'Desconhecida',
}

const MEDIA_LABEL: Record<PlaybackTechnicalInfo['mediaKind'], string> = {
  channel: 'Canal ao vivo',
  movie: 'Filme',
  episode: 'Episódio',
  series: 'Série',
  unclassified: 'Item',
  unknown: 'Não identificado',
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
  const rows: Array<[string, string]> = [
    ['Código', info.code],
    ['Causa', CATEGORY_LABEL[info.category]],
    ['Mídia', MEDIA_LABEL[info.mediaKind]],
    ['Motor', info.engine],
    ['Hora', formatTime(info.at)],
  ]
  return (
    <div className="modal-overlay">
      <div className="modal-panel player-panel no-scrollbar" role="dialog" aria-modal="true" aria-label="Info técnica do erro">
        <h2 className="modal-title">Info técnica</h2>
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
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

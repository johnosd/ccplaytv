import { useOnlineStatus } from '../lib/onlineStatus'
import type { StreamInfo } from '../lib/player/tracks'
import type { RequestHeadersReport } from '../lib/player/PlayerService'
import { buildInfoRows } from './playerPanels'
import { useT } from '../lib/i18n/I18nProvider'

export interface PlayerInfoPanelProps {
  /** Última leitura do motor; `null` quando ele não conseguiu informar. */
  info: StreamInfo | null
  /** Rótulo da faixa de áudio ativa, quando o motor informa (`trackLabels`). */
  activeAudioLabel: string | undefined
  /** Feature 058 (FR-005): só os nomes dos headers da lista; ausente = sem a linha. */
  headers?: RequestHeadersReport
}

/**
 * Painel "Info do stream" (feature 029, `logic/faixas-e-legendas.md` §6) —
 * desenho puro: só as linhas que o motor informou e o estado de rede do
 * aparelho, nunca um valor estimado nem nada derivado da URL (D-007). O
 * único focável é "Fechar"; quem fecha e quem relê a cada 1 s é o
 * `PlayerLayer`. A conexão vem de `useOnlineStatus`, então acompanha
 * `online`/`offline` mesmo entre duas leituras.
 */
export function PlayerInfoPanel({ info, activeAudioLabel, headers }: PlayerInfoPanelProps) {
  const t = useT()
  const online = useOnlineStatus()
  const { rows, noTechnicalData } = buildInfoRows(info, activeAudioLabel, online, t, headers)

  return (
    <div className="modal-overlay">
      <div className="modal-panel player-panel no-scrollbar" role="dialog" aria-modal="true" aria-label={t('player.info.title')}>
        <h2 className="modal-title">{t('player.info.title')}</h2>
        {noTechnicalData && <p className="player-panel-note">{t('player.info.noTechnical')}</p>}
        <dl className="player-info-list">
          {rows.map((row) => (
            <div key={row.key} className="player-info-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
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

import { useOnlineStatus } from '../lib/onlineStatus'
import type { StreamInfo } from '../lib/player/tracks'
import { buildInfoRows, NO_TECHNICAL_DATA_MESSAGE } from './playerPanels'

export interface PlayerInfoPanelProps {
  /** Última leitura do motor; `null` quando ele não conseguiu informar. */
  info: StreamInfo | null
  /** Rótulo da faixa de áudio ativa, quando o motor informa (`trackLabels`). */
  activeAudioLabel: string | undefined
}

/**
 * Painel "Info do stream" (feature 029, `logic/faixas-e-legendas.md` §6) —
 * desenho puro: só as linhas que o motor informou e o estado de rede do
 * aparelho, nunca um valor estimado nem nada derivado da URL (D-007). O
 * único focável é "Fechar"; quem fecha e quem relê a cada 1 s é o
 * `PlayerLayer`. A conexão vem de `useOnlineStatus`, então acompanha
 * `online`/`offline` mesmo entre duas leituras.
 */
export function PlayerInfoPanel({ info, activeAudioLabel }: PlayerInfoPanelProps) {
  const online = useOnlineStatus()
  const { rows, noTechnicalData } = buildInfoRows(info, activeAudioLabel, online)

  return (
    <div className="modal-overlay">
      <div className="modal-panel player-panel no-scrollbar" role="dialog" aria-modal="true" aria-label="Info do stream">
        <h2 className="modal-title">Info do stream</h2>
        {noTechnicalData && <p className="player-panel-note">{NO_TECHNICAL_DATA_MESSAGE}</p>}
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
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

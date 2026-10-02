import type { ReactNode } from 'react'
import type { PlayerPreferences } from '../../lib/player/playerPreferences'
import { PREFERENCE_ROWS, preferenceValueLabel } from './playerPreferencesModel'

export interface PlayerPreferencesPanelProps {
  preferences: PlayerPreferences
  /** `undefined` = nenhuma linha focada agora (zona `tabs` ou seletor aberto). */
  focusedRow?: number
  onActivateRow: (row: number) => void
}

/**
 * Aba "Player & reprodução" (feature 041, US3): quatro preferências do
 * APARELHO — não da lista (FR-011). Mesmo molde visual da Privacidade; cada
 * linha mostra o valor atual no nome acessível ("<rótulo>: <valor>").
 */
export function PlayerPreferencesPanel({ preferences, focusedRow, onActivateRow }: PlayerPreferencesPanelProps): ReactNode {
  return (
    <div className="privacy-panel">
      <h2 className="privacy-panel-heading">Player & reprodução</h2>
      <p className="privacy-panel-note">
        Valem para toda reprodução nova neste aparelho. No player, a escolha vale só até o fim da sequência.
      </p>
      {PREFERENCE_ROWS.map((row, index) => {
        const value = preferenceValueLabel(row, preferences)
        return (
          <button
            key={row.id}
            type="button"
            className={`privacy-panel-row no-scale${focusedRow === index ? ' tv-focus' : ''}`}
            aria-label={`${row.label}: ${value}`}
            onClick={() => onActivateRow(index)}
          >
            <span>{row.label}</span>
            <span className="privacy-panel-value">{value}</span>
          </button>
        )
      })}
    </div>
  )
}

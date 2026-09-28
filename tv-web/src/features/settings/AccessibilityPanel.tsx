import type { ReactNode } from 'react'

/** "Reduzir movimento" (real) + 3 mocks (feature 026, FR-029/FR-031, `logic/foco-configuracoes.md` §5). */
export const ACCESSIBILITY_ROW_COUNT = 4

const MOCK_ROWS = ['Voice Guide / anúncios', 'Alto contraste', 'Aparência das legendas']

export interface AccessibilityPanelProps {
  reducedMotion: boolean
  /** `undefined` = nenhuma linha focada agora (zona `tabs`) — nada ganha `.tv-focus`. */
  focusedRow?: number
  onActivateRow: (row: number) => void
}

/** O motor pode não expor a media query (Tizen antigo) — nunca lança. */
function systemPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Acessibilidade & sistema (feature 026, US2 — FR-029). "Reduzir movimento"
 * é a única ação real; o resto são mocks honestos (item 56 do backlog).
 */
export function AccessibilityPanel({ reducedMotion, focusedRow, onActivateRow }: AccessibilityPanelProps): ReactNode {
  const systemReduced = systemPrefersReducedMotion()

  return (
    <div className="accessibility-panel">
      <div className="accessibility-panel-row">
        <button
          type="button"
          className={`accessibility-panel-toggle${focusedRow === 0 ? ' tv-focus' : ''}`}
          onClick={() => onActivateRow(0)}
        >
          <span>Reduzir movimento</span>
          <span className="accessibility-panel-value">{reducedMotion ? 'Ligado' : 'Desligado'}</span>
        </button>
        {systemReduced && (
          <p className="accessibility-panel-note">O sistema já está com movimento reduzido.</p>
        )}
      </div>

      {MOCK_ROWS.map((label, index) => {
        const row = index + 1
        return (
          <button
            key={label}
            type="button"
            className={`accessibility-panel-toggle is-soft-disabled${focusedRow === row ? ' tv-focus' : ''}`}
            onClick={() => onActivateRow(row)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

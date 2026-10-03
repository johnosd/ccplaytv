import type { ReactNode } from 'react'
import { useLanguage, useT } from '../../lib/i18n/I18nProvider'
import { APP_LANGUAGE_NATIVE_NAME } from '../../lib/i18n/languages'
import type { MessageKey } from '../../lib/i18n/messages/pt'

/**
 * "Reduzir movimento" (real), "Idioma" (real, feature 054) + 3 mocks (feature 026,
 * FR-029/FR-031, `logic/foco-configuracoes.md` §5). Linhas: 0 movimento, 1 idioma, 2..4 mocks.
 */
export const ACCESSIBILITY_ROW_COUNT = 5

/** Índice da linha "Idioma" (feature 054, D-009). */
export const ACCESSIBILITY_LANGUAGE_ROW = 1

const MOCK_ROWS: MessageKey[] = ['settings.a11y.voiceGuide', 'settings.a11y.highContrast', 'settings.a11y.subtitles']

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
 * Acessibilidade & sistema (feature 026, US2 — FR-029). "Reduzir movimento" e
 * "Idioma" são as ações reais; o resto são mocks honestos (item 56 do backlog).
 */
export function AccessibilityPanel({ reducedMotion, focusedRow, onActivateRow }: AccessibilityPanelProps): ReactNode {
  const t = useT()
  const language = useLanguage()
  const systemReduced = systemPrefersReducedMotion()
  const languageLabel = t('settings.language.label')
  const languageName = APP_LANGUAGE_NATIVE_NAME[language]

  return (
    <div className="accessibility-panel">
      <div className="accessibility-panel-row">
        <button
          type="button"
          className={`accessibility-panel-toggle no-scale${focusedRow === 0 ? ' tv-focus' : ''}`}
          onClick={() => onActivateRow(0)}
        >
          <span>{t('settings.reducedMotion.label')}</span>
          <span className="accessibility-panel-value">{reducedMotion ? t('common.on') : t('common.off')}</span>
        </button>
        {systemReduced && <p className="accessibility-panel-note">{t('settings.a11y.systemReduced')}</p>}
      </div>

      <button
        type="button"
        className={`accessibility-panel-toggle no-scale${focusedRow === ACCESSIBILITY_LANGUAGE_ROW ? ' tv-focus' : ''}`}
        aria-label={`${languageLabel}: ${languageName}`}
        onClick={() => onActivateRow(ACCESSIBILITY_LANGUAGE_ROW)}
      >
        <span>{languageLabel}</span>
        <span className="accessibility-panel-value">{languageName}</span>
      </button>

      {MOCK_ROWS.map((labelKey, index) => {
        const row = index + 2
        return (
          <button
            key={labelKey}
            type="button"
            className={`accessibility-panel-toggle no-scale is-soft-disabled${focusedRow === row ? ' tv-focus' : ''}`}
            // Achado real (feature 028, FR-016): mock sempre indisponível, mas
            // sem sinal estático pra tecnologia assistiva.
            aria-disabled="true"
            onClick={() => onActivateRow(row)}
          >
            {t(labelKey)}
          </button>
        )
      })}
    </div>
  )
}

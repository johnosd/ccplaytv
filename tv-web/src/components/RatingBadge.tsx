import type { ReactNode } from 'react'
import { useT } from '../lib/i18n/I18nProvider'
import { APP_LANGUAGE_LOCALE } from '../lib/i18n/languages'

export interface RatingBadgeProps {
  /** Nota do provedor, 0–10. Ausente, 0 ou inválida = não renderiza nada (feature 055, FR-003/FR-004). */
  value?: number | null
  /** `true`: "★ 7,4 Provedor" (destaque/detalhe, FR-006). `false`/ausente: só "★ 7,4" (card, FR-005). */
  showSource?: boolean
}

/**
 * Um formatador por idioma: criar `Intl.NumberFormat` custa muito na TV e o selo aparece em dezenas de cards a cada render
 * da grade (feature 084, T022).
 */
const formatters = new Map<string, Intl.NumberFormat>()
function ratingFormatter(locale: string): Intl.NumberFormat {
  let formatter = formatters.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    formatters.set(locale, formatter)
  }
  return formatter
}

/**
 * Selo da nota do provedor (feature 055). Só apresentação — não focável, sem `tabindex`, sem botão (FR-009). O número
 * sai com uma casa e o separador do idioma do app; o rótulo "Provedor" vem do i18n e nunca diz IMDb/TMDB (FR-014).
 * Valor fora de (0, 10] vira nada — nem "0", nem "sem nota" (FR-003/FR-004).
 */
export function RatingBadge({ value, showSource }: RatingBadgeProps): ReactNode {
  const t = useT()
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10) return null
  const formatted = ratingFormatter(APP_LANGUAGE_LOCALE[t.language]).format(value)
  return (
    <span className="rating-badge">
      ★ {formatted}
      {showSource && <span className="rating-badge-source">{t('rating.provider')}</span>}
    </span>
  )
}

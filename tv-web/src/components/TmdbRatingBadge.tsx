import type { ReactNode } from 'react'
import { tmdbRatingToShow, type TmdbRating } from '../lib/metadata/contentRating'
import { useT } from '../lib/i18n/I18nProvider'
import { APP_LANGUAGE_LOCALE } from '../lib/i18n/languages'

export interface TmdbRatingBadgeProps {
  rating?: TmdbRating
}

/**
 * Nota do TMDB ("TMDB 7,8", feature 061, FR-008). Separada do `RatingBadge` da 055, que é só a nota do provedor e nunca diz
 * TMDB (contrato travado da 055). Só apresentação, não focável; abaixo do mínimo de votos não renderiza nada.
 */
export function TmdbRatingBadge({ rating }: TmdbRatingBadgeProps): ReactNode {
  const t = useT()
  const average = tmdbRatingToShow(rating)
  if (average === null) return null
  const formatted = new Intl.NumberFormat(APP_LANGUAGE_LOCALE[t.language], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average)
  return <span className="tmdb-rating-badge">{`TMDB ${formatted}`}</span>
}

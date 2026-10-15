import type { ReactNode } from 'react'
import { certificationFor, type Certifications } from '../lib/metadata/contentRating'
import { useT } from '../lib/i18n/I18nProvider'

export interface ContentRatingBadgeProps {
  /** Classificações guardadas do título (BR/US/ES). O selo mostra só a do país do idioma do app (FR-004/FR-005). */
  certifications?: Certifications
}

/**
 * Selo da classificação indicativa (feature 061, `logic/classificacao-e-nota.md` §3). Só apresentação, não focável.
 * Brasil com as cores oficiais por token; EUA e Espanha neutros. Nome acessível com o significado, nunca só cor/número.
 */
export function ContentRatingBadge({ certifications }: ContentRatingBadgeProps): ReactNode {
  const t = useT()
  const rating = certificationFor(certifications, t.language)
  if (!rating) return null
  const meaning = rating.country === 'BR'
    ? rating.value === 'L' ? t('rating.content.free') : t('rating.content.years', { n: rating.value })
    : rating.value
  return (
    <span
      className={`content-rating-badge${rating.country === 'BR' ? ` content-rating-badge--br-${rating.value.toLowerCase()}` : ''}`}
      aria-label={t('rating.content.aria', { value: meaning })}
    >
      {rating.value}
    </span>
  )
}

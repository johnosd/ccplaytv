import type { ReactNode } from 'react'
import { PosterArt } from './PosterArt'

export type ContentCardVariant = 'portrait' | 'landscape' | 'wide' | 'compact'

export interface ContentCardProps {
  variant: ContentCardVariant
  title: string
  meta?: string
  iconUrl?: string
  focused?: boolean
  /** Progresso/assistido/AO VIVO — o consumidor decide o conteúdo, este componente só posiciona. */
  badge?: ReactNode
  onSelect?: () => void
}

/**
 * Cobre as 4 proporções do catálogo (portrait/landscape/wide/compact) por
 * cima do `PosterArt` existente (feature 015) — nunca reimplementa
 * `<img>`/fallback (D-006 do plan.md, FR-018).
 */
export function ContentCard({ variant, title, meta, iconUrl, focused, badge, onSelect }: ContentCardProps): ReactNode {
  return (
    <div className={`content-card content-card--${variant}`} onClick={onSelect}>
      <PosterArt url={iconUrl} title={title} focused={focused}>
        {badge}
      </PosterArt>
      <div className="content-card-title">{title}</div>
      {meta && <div className="content-card-meta">{meta}</div>}
    </div>
  )
}

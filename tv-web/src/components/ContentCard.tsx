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
  /**
   * Número grande ao lado do pôster (formato Top 10, feature 053) — opt-in e decorativo (`aria-hidden`): é só layout,
   * nunca um ranking que o app calcule. Sem a prop o card é idêntico ao de antes.
   */
  rank?: number
}

/**
 * Cobre as 4 proporções do catálogo (portrait/landscape/wide/compact) por
 * cima do `PosterArt` existente (feature 015) — nunca reimplementa
 * `<img>`/fallback (D-006 do plan.md, FR-018).
 */
export function ContentCard({ variant, title, meta, iconUrl, focused, badge, onSelect, rank }: ContentCardProps): ReactNode {
  return (
    <div className={`content-card content-card--${variant}${rank !== undefined ? ' content-card--ranked' : ''}`} onClick={onSelect}>
      {rank !== undefined && (
        <span className="content-card-rank" aria-hidden="true">
          {rank}
        </span>
      )}
      <PosterArt url={iconUrl} title={title} focused={focused}>
        {badge}
      </PosterArt>
      <div className="content-card-title">{title}</div>
      {meta && <div className="content-card-meta">{meta}</div>}
    </div>
  )
}

import type { CSSProperties, ReactNode } from 'react'
import { PosterArt } from '../../components/PosterArt'
import type { MetadataOrigin } from '../../lib/metadata/types'
import { DetailBackdrop } from './DetailMetadata'
import { useCoverColor } from './useCoverColor'
import { usePanelHosts } from './usePanelHosts'

export interface DetailHeroProps {
  eyebrow: string
  title: string
  posterUrl?: string
  backdropUrl?: string
  backdropOrigin?: MetadataOrigin
  /** Selo de assistido sobre a capa (só filme). */
  watched?: boolean
  meta: ReactNode
  chips: ReactNode
  synopsis: ReactNode
  actions: ReactNode
}

/**
 * Hero "Cinema" do detalhe de filme e de série (feature 059,
 * `logic/hero-cinema.md` §1–§2). Só apresentação — sem foco, sem dado buscado
 * além da cor da capa (`useCoverColor`, que nunca bloqueia).
 *
 * Fundo em camadas, todas FILHAS do `.vod-detail-hero` (D-005): o ambiente
 * (cor da capa ou gradiente neutro) por baixo, o backdrop por cima quando
 * existe, e a vinheta. Nunca estilo no `.screen`: o plano de hardware do
 * player só esconde os filhos do `.screen` (`player.css`), e um fundo no
 * próprio `.screen` pintaria por cima do vídeo (FR-025).
 */
export function DetailHero({
  eyebrow,
  title,
  posterUrl,
  backdropUrl,
  backdropOrigin,
  watched,
  meta,
  chips,
  synopsis,
  actions,
}: DetailHeroProps): ReactNode {
  const coverColor = useCoverColor(posterUrl, usePanelHosts())
  const ambientStyle = coverColor ? ({ '--detail-ambient': coverColor } as CSSProperties) : undefined

  return (
    <div className={`vod-detail-hero vod-detail-hero--cinema${coverColor ? ' has-cover-color' : ''}`} style={ambientStyle}>
      <div className="vod-detail-ambient" aria-hidden="true" />
      <DetailBackdrop url={backdropUrl} origin={backdropOrigin} />
      <div className="vod-detail-scrim" aria-hidden="true" />
      <div className="vod-detail-poster">
        <PosterArt url={posterUrl} title={title}>
          {/* Só o glifo: o texto "✓ Assistido" já está na linha de metadata, e repeti-lo duplicaria a leitura. */}
          {watched && (
            <span className="vod-detail-watched-badge" aria-hidden="true">
              ✓
            </span>
          )}
        </PosterArt>
      </div>
      <div className="vod-detail-info">
        <div className="vod-detail-eyebrow">{eyebrow}</div>
        <div className="vod-detail-title">{title}</div>
        <div className="vod-detail-meta">{meta}</div>
        {chips}
        {synopsis}
        <div className="vod-detail-actions">{actions}</div>
      </div>
    </div>
  )
}

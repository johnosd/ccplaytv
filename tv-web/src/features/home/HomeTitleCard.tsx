import { useState, type CSSProperties, type ReactNode } from 'react'
import { PosterArt } from '../../components/PosterArt'
import { RatingBadge } from '../../components/RatingBadge'
import { ContentRatingBadge } from '../../components/ContentRatingBadge'
import { TmdbRatingBadge } from '../../components/TmdbRatingBadge'
import type { TmdbRating } from '../../lib/metadata/contentRating'
import { useT } from '../../lib/i18n/I18nProvider'
import { useCachedTitleView, type CatalogItemOut } from '../catalog/catalogApi'
import { formatDurationMinutes } from '../vod/detailMetadataFormat'
import type { PrimaryProgress } from '../vod/detailProgress'
import { useCoverColor } from '../vod/useCoverColor'
import { usePanelHosts } from '../vod/usePanelHosts'
import type { CardBadges } from './cardBadges'
import type { HomeRowFormat } from './homeRowFormats'

export interface HomeTitleCardProps {
  item: CatalogItemOut
  format: Extract<HomeRowFormat, 'poster' | 'rank' | 'continue'>
  focused: boolean
  /** Numeral do Top 10: a posição do card NA FILEIRA (1, 2, 3…, sem buracos — feature 057), nunca a do TMDB. */
  rank?: number
  badges: CardBadges
  /** Imagem 16:9 já no aparelho (`useHomeImages`): vira o rosto do card de Continuar e o fundo do card expandido. */
  image?: string
  /** Nota da descoberta já no aparelho; o cache de metadata tem precedência (061). */
  tmdbRating?: TmdbRating
  /** Só Continuar: barra de progresso real (posição E duração conhecidas). */
  progress?: PrimaryProgress | null
  /** Só Continuar: legenda embaixo do card (`T1:E3 · faltam 26 min`). */
  caption?: string
}

/**
 * Card de título do Início (feature 060, `logic/cards-e-expansao.md` §3): a raiz (`.home-card`) carrega `data-item-id` e é
 * o único elemento com `tv-focus` — o contrato 060 lê `closest('[data-item-id]')` do foco. Só apresentação.
 *
 * O `PosterArt` NÃO recebe `focused`: ele também ligaria `tv-focus` no `.poster-box` e haveria dois focos na tela.
 * Com o foco o card **expande** (FR-009); a camada expandida só existe enquanto ele está focado e lê apenas o que já está
 * no aparelho — focar nunca consulta nada (FR-022).
 */
export function HomeTitleCard({ item, format, focused, rank, badges, image, tmdbRating, progress, caption }: HomeTitleCardProps): ReactNode {
  const t = useT()
  // O card de Continuar é 16:9: usa a imagem larga quando há; senão a capa, cortada pelo `object-fit: cover`.
  const face = format === 'continue' ? (image ?? item.icon_url ?? undefined) : (item.icon_url ?? undefined)

  const card = (
    <div className={`home-card home-card--${format}${focused ? ' is-expanded tv-focus' : ''}`} data-item-id={item.id}>
      <PosterArt url={face} title={item.name} />
      <span className="home-card-title">{item.name}</span>
      {badges.isNew && (
        <span className="home-badge home-badge--new">
          {t('home.badge.new').toLocaleUpperCase()}
        </span>
      )}
      {badges.rating !== null && (
        <span className="home-badge home-badge--rating">
          <RatingBadge value={badges.rating} />
        </span>
      )}
      {(badges.watched || badges.favorite) && (
        <span className="home-card-marks">
          {badges.watched && (
            <span className="home-mark home-mark--watched" aria-hidden="true">
              ✓
            </span>
          )}
          {badges.favorite && (
            <span className="home-mark home-mark--favorite" aria-hidden="true">
              ♥
            </span>
          )}
        </span>
      )}
      {/* Texto para quem não vê os selos: a cor e o glifo nunca são o único sinal (constitution, Foco Visível). */}
      {(badges.watched || badges.favorite) && (
        <span className="sr-only">
          {[badges.watched && t('home.badge.watched'), badges.favorite && t('home.badge.inMyList')].filter(Boolean).join(', ')}
        </span>
      )}
      {progress && (
        <div className="home-card-progress" aria-hidden="true">
          <i style={{ width: `${progress.percent}%` }} />
        </div>
      )}
      {focused && <HomeCardExpanded item={item} image={image} tmdbRating={tmdbRating} />}
    </div>
  )

  if (format === 'continue') {
    return (
      <div className="home-continue-slot">
        {card}
        {caption && <div className="home-card-caption">{caption}</div>}
      </div>
    )
  }
  if (rank === undefined) return card
  return (
    <div className="home-rank-slot">
      {/* O numeral é decorativo: a posição já está na ordem da fileira. */}
      <span className="home-rank-numeral" aria-hidden="true">
        {rank}
      </span>
      {card}
    </div>
  )
}

/**
 * Camada do card expandido (FR-009): imagem 16:9 com título, metadata, até 2 linhas de sinopse e "OK Detalhes". Sem imagem
 * 16:9, o pôster à esquerda e as informações sobre a cor da capa (regra "sem risco" da 059). Monta só no foco: é aqui, e não
 * em cada card, que a cor da capa e o cache de metadata são lidos.
 */
function HomeCardExpanded({ item, image, tmdbRating }: { item: CatalogItemOut; image?: string; tmdbRating?: TmdbRating }): ReactNode {
  const t = useT()
  const color = useCoverColor(item.icon_url ?? undefined, usePanelHosts())
  const view = useCachedTitleView(item)
  const [failedImage, setFailedImage] = useState<string | undefined>(undefined)
  const showImage = image !== undefined && image !== failedImage

  const duration = view?.durationSeconds?.value
  const genres = view?.genres?.value ?? item.provider_genres ?? undefined
  const synopsis = view?.synopsis?.value
  const meta = [
    item.year != null ? String(item.year) : null,
    duration != null && duration > 0 ? formatDurationMinutes(duration) : null,
    genres ?? null,
  ].filter((part): part is string => part !== null)
  const style = color ? ({ '--home-card-ambient': color } as CSSProperties) : undefined

  return (
    <div className={`home-card-expanded${showImage ? '' : ' home-card-expanded--poster'}${color ? ' has-cover-color' : ''}`} style={style}>
      {showImage ? (
        <img className="home-card-expanded-img" src={image} alt="" decoding="async" onError={() => setFailedImage(image)} />
      ) : (
        <div className="home-card-expanded-cover">
          <PosterArt url={item.icon_url ?? undefined} title={item.name} />
        </div>
      )}
      <div className="home-card-expanded-scrim" />
      <div className="home-card-expanded-info">
        <div className="home-card-expanded-title">{item.name}</div>
        <div className="home-card-expanded-meta">
          {meta.map((part) => (
            <span key={part}>{part}</span>
          ))}
          <RatingBadge value={item.provider_rating} />
          <ContentRatingBadge certifications={view?.certifications} />
          <TmdbRatingBadge rating={view?.tmdbRating ?? tmdbRating} />
        </div>
        {synopsis && <p className="home-card-expanded-synopsis">{synopsis}</p>}
        <div className="home-card-expanded-hint">
          <span className="home-card-expanded-key">OK</span> {t('home.card.details')}
        </div>
      </div>
    </div>
  )
}

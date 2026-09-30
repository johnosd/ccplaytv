import type { ReactNode } from 'react'
import { PosterArt } from './PosterArt'

export interface ChannelRowProps {
  /** `undefined` = não derivável (feature 024, `channelNumberOf`) — nenhuma coluna de número desenhada com texto, nunca um número inventado. */
  number?: string
  logoUrl?: string
  name: string
  /** `undefined` = sem EPG, slot reservado vazio, nunca "0"/inventado (FR-019). */
  nowPlaying?: string
  /** 0–1, barra só desenhada se vier. */
  progress?: number
  focused?: boolean
  /** Classe extra no nome (feature 024, D-008) — a Live TV fixa `.live-item-name` por contrato da feature 018. */
  nameClassName?: string
  /** Estrela de favorito (feature 024, mesmo padrão visual das grades de Filmes/Séries). */
  favorite?: boolean
  /** Sem fonte de reprodução (feature 024, FR-019/FR-009 pré-existente): selo "Indisponível" + aparência reduzida. */
  unavailable?: boolean
}

/**
 * Linha compacta de canal: número, logo (via `PosterArt`, reaproveitado —
 * não uma cópia da lógica de fallback), nome, slot "Agora" e progresso
 * (feature 022, D-007 do plan.md). Número, favorito e indisponibilidade
 * estendidos pela feature 024 (D-007/FR-009/FR-019).
 */
export function ChannelRow({
  number,
  logoUrl,
  name,
  nowPlaying,
  progress,
  focused,
  nameClassName,
  favorite,
  unavailable,
}: ChannelRowProps): ReactNode {
  return (
    <div className={`channel-row${unavailable ? ' is-soft-disabled' : ''}`}>
      {number !== undefined && <span className="channel-row-number">{number}</span>}
      <PosterArt url={logoUrl} title={name} focused={focused} variant="logo" />
      <div className="channel-row-info">
        <span className={nameClassName ? `channel-row-name ${nameClassName}` : 'channel-row-name'}>{name}</span>
        <span className="channel-row-now">{nowPlaying ?? ''}</span>
      </div>
      {progress !== undefined && (
        <div className="channel-row-progress">
          <div className="channel-row-progress-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
      {favorite && (
        <span className="fav-star" aria-hidden="true">
          ★
        </span>
      )}
      {unavailable && <span className="channel-row-badge">Indisponível</span>}
    </div>
  )
}

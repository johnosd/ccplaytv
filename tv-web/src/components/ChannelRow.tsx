import type { ReactNode } from 'react'
import { PosterArt } from './PosterArt'

export interface ChannelRowProps {
  number: string
  logoUrl?: string
  name: string
  /** `undefined` = sem EPG, slot reservado vazio, nunca "0"/inventado (FR-019). */
  nowPlaying?: string
  /** 0–1, barra só desenhada se vier. */
  progress?: number
  focused?: boolean
}

/**
 * Linha compacta de canal: número, logo (via `PosterArt`, reaproveitado —
 * não uma cópia da lógica de fallback), nome, slot "Agora" e progresso
 * (feature 022, D-007 do plan.md).
 */
export function ChannelRow({ number, logoUrl, name, nowPlaying, progress, focused }: ChannelRowProps): ReactNode {
  return (
    <div className="channel-row">
      <span className="channel-row-number">{number}</span>
      <PosterArt url={logoUrl} title={name} focused={focused} />
      <div className="channel-row-info">
        <span className="channel-row-name">{name}</span>
        <span className="channel-row-now">{nowPlaying ?? ''}</span>
      </div>
      {progress !== undefined && (
        <div className="channel-row-progress">
          <div className="channel-row-progress-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
    </div>
  )
}

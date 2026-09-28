import type { PlayerCapabilities, PlayerProgress } from '../lib/player/PlayerService'
import { formatTime } from '../lib/player/formatTime'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'
import { PosterArt } from './PosterArt'
import { hasSeekBar, type ChromeControl, type ChromeControlId, type ChromeMedia, type PlayerIdentity } from './chromeControls'

const CONTROL_ICON: Record<ChromeControlId, IconName> = {
  episodePrevious: 'skipPrevious',
  jumpBack: 'rewind',
  playPause: 'pause', // sobrescrito dinamicamente por `paused`, ver abaixo
  jumpForward: 'forward',
  episodeNext: 'skipNext',
  tracks: 'audio',
  quality: 'quality',
  speed: 'speed',
  aspect: 'aspect',
  info: 'info',
  guide: 'guide',
}

function iconOf(control: ChromeControl, paused: boolean): IconName {
  if (control.id === 'playPause') return paused ? 'play' : 'pause'
  return CONTROL_ICON[control.id]
}

/** Texto visível curto do botão — o rótulo completo/explicativo vai só no `aria-label` (FR-030). */
function shortText(control: ChromeControl, paused: boolean): string {
  switch (control.id) {
    case 'episodePrevious':
      return 'Anterior'
    case 'jumpBack':
      return '10s'
    case 'playPause':
      return paused ? 'Reproduzir' : 'Pausar'
    case 'jumpForward':
      return '10s'
    case 'episodeNext':
      return 'Próximo'
    case 'tracks':
      return 'Áudio'
    case 'quality':
      return 'Qualidade'
    case 'speed':
      return 'Velocidade'
    case 'aspect':
      return 'Aspecto'
    case 'info':
      return 'Info'
    case 'guide':
      return 'Guia'
  }
}

export interface PlayerChromeProps {
  media: ChromeMedia
  identity: PlayerIdentity
  /** Reprodução pausada agora — decide o glifo/rótulo de `playPause` e some/mantém a timeline. */
  paused: boolean
  /**
   * Linha de controles já calculada (`chromeControls`). Vazia no nível
   * "band" do Live (US2) — a faixa não renderiza `<button>` nenhum.
   */
  controls: ChromeControl[]
  /** Índice focado em `controls`, ou `null` quando o foco está na barra de progresso ou não há linha visível. */
  focusedIndex: number | null
  capabilities: PlayerCapabilities
  progress: PlayerProgress | null
  /** A própria barra de progresso está focada (VOD, ↑ a partir do 1º botão). */
  seekBarFocused?: boolean
}

/**
 * Chrome V14 do player (feature 027, `logic/chrome-player.md` §2) — desenho
 * puro, sem estado de foco próprio (ADR-009): quem decide nível/foco é
 * `PlayerLayer`. VOD desenha título/subtítulo + timeline + linha; Live
 * desenha a faixa (live bug, número, logo, nome — nenhum `<button>`) e,
 * quando `controls` não está vazio, a linha por baixo dela.
 */
export function PlayerChrome({
  media,
  identity,
  paused,
  controls,
  focusedIndex,
  capabilities,
  progress,
  seekBarFocused,
}: PlayerChromeProps) {
  const isLive = media === 'live'
  // A timeline (total + barra) exige canSeek, não só reportsDuration — sem
  // capacidade de busca, ela não existe (US1/AC5), igual jumpBack/
  // jumpForward. O tempo decorrido sozinho não depende disso.
  const showTimeline = !isLive && capabilities.canSeek && hasSeekBar(capabilities, progress)
  const elapsed = !isLive && progress ? formatTime(progress.positionMs) : null
  const total = showTimeline && progress?.durationMs !== undefined ? formatTime(progress.durationMs) : null
  const ratio =
    showTimeline && progress?.durationMs && progress.durationMs > 0
      ? Math.min(1, Math.max(0, progress.positionMs / progress.durationMs))
      : null

  return (
    <div className="player-chrome">
      {isLive ? (
        <div className="player-chrome-band">
          <span className="player-chrome-live-badge">AO VIVO</span>
          {identity.channelNumber != null && <span className="player-chrome-number">{identity.channelNumber}</span>}
          <PosterArt url={identity.logoUrl ?? undefined} title={identity.title} variant="logo" />
          <span className="player-chrome-name">{identity.title}</span>
        </div>
      ) : (
        <div className="player-chrome-identity">
          <div className="player-chrome-title">{identity.title}</div>
          {identity.subtitle && <div className="player-chrome-subtitle">{identity.subtitle}</div>}
        </div>
      )}

      {elapsed !== null && (
        <div className="player-chrome-time">
          <span>{elapsed}</span>
          {total !== null && (
            <>
              <div className={`player-chrome-time-bar${seekBarFocused ? ' tv-focus' : ''}`} role="presentation">
                <div className="player-chrome-time-bar-fill" style={{ width: `${(ratio ?? 0) * 100}%` }} />
              </div>
              <span>{total}</span>
            </>
          )}
        </div>
      )}

      {controls.length > 0 && (
        <div className="player-chrome-row">
          {controls.map((control, i) => (
            <button
              key={control.id}
              type="button"
              className={`player-chrome-button${i === focusedIndex ? ' tv-focus' : ''}${
                control.availability !== 'real' ? ' is-soft-disabled' : ''
              }`}
              aria-label={control.label}
              aria-disabled={control.availability !== 'real' ? 'true' : undefined}
            >
              <Icon name={iconOf(control, paused)} />
              <span aria-hidden="true">{shortText(control, paused)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { PosterArt } from '../../components/PosterArt'
import { useLanguage, useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { countryDisplayName } from '../../lib/radio/countryNames'
import type { RadioPlaybackState } from './useRadioPlayback'

/** Ações da barra, na ordem visual (`logic/radio-tela.md` §5.3). */
export type NowPlayingAction = 'stop' | 'retry' | 'next'

const ACTION_LABEL: Record<NowPlayingAction, MessageKey> = {
  stop: 'radio.action.stop',
  retry: 'radio.action.retry',
  next: 'radio.action.next',
}

/** Ações disponíveis para o estado atual; vazio = a barra não é focável (D-006). */
export function nowPlayingActions(state: RadioPlaybackState): NowPlayingAction[] {
  if (state.status === 'connecting' || state.status === 'playing') return ['stop']
  if (state.status === 'failed') return ['retry', 'next']
  return []
}

export interface NowPlayingBarProps {
  state: RadioPlaybackState
  /** Índice da ação com foco (zona `bar`), ou `null`. */
  focusedAction: number | null
  /** "Próxima estação" sem próxima na lista: soft disabled. */
  nextAvailable: boolean
  onAction: (action: NowPlayingAction) => void
}

/**
 * Barra "Tocando agora" (feature 074, D-006): fica no slot da topbar do `AppShell`. Só informa e oferece ações — nunca
 * puxa o foco; mudanças de estado são anunciadas por quem a monta.
 */
export function NowPlayingBar({ state, focusedAction, nextAvailable, onAction }: NowPlayingBarProps): ReactNode {
  const t = useT()
  const language = useLanguage()
  const actions = nowPlayingActions(state)
  const station = state.status === 'idle' ? null : state.station
  const statusKey: MessageKey | null =
    state.status === 'connecting'
      ? 'radio.state.connecting'
      : state.status === 'playing'
        ? 'radio.state.playing'
        : state.status === 'failed'
          ? state.reason === 'offline'
            ? 'radio.state.offline'
            : 'radio.state.unavailable'
          : null
  const meta = station
    ? [
        station.countryCode ? countryDisplayName(station.countryCode, language) : '',
        station.codec ?? '',
        station.bitrate ? `${station.bitrate} kbps` : '',
      ].filter(Boolean)
    : []

  return (
    <section className="radio-now-playing" aria-label={t('radio.nowPlaying')}>
      {station && <PosterArt url={station.artUrl} title={station.name} variant="logo" />}
      <div className="radio-now-playing-info">
        <span className="radio-now-playing-label">{t('radio.nowPlaying')}</span>
        <span className="radio-now-playing-name">{station ? station.name : t('radio.nothingPlaying')}</span>
        {(meta.length > 0 || statusKey) && (
          <span className="radio-now-playing-meta">
            {statusKey && (
              <span className={`radio-now-playing-state${state.status === 'failed' ? ' is-failed' : ''}`}>{t(statusKey)}</span>
            )}
            {meta.length > 0 && ` · ${meta.join(' · ')}`}
          </span>
        )}
      </div>
      {actions.length > 0 && (
        <div className="radio-now-playing-actions">
          {actions.map((action, index) => {
            const disabled = action === 'next' && !nextAvailable
            return (
              <Button
                key={action}
                variant={action === 'stop' || action === 'retry' ? 'primary' : 'secondary'}
                softDisabled={disabled}
                focused={focusedAction === index}
                onSelect={() => {
                  if (!disabled) onAction(action)
                }}
              >
                {t(ACTION_LABEL[action])}
              </Button>
            )
          })}
        </div>
      )}
    </section>
  )
}

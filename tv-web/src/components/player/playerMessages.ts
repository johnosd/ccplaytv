import type { MessageKey } from '../../lib/i18n/messages/pt'
import type { PlayerState } from '../../lib/player/PlayerService'

/**
 * Textos do player — agora CHAVES do catálogo (feature 054, `playerUi.ts`): quem mostra chama `t(chave)`.
 * Vazio = sem texto (o ícone do chrome já comunica o estado).
 */
export const STATE_LABEL_KEY: Record<PlayerState, MessageKey | null> = {
  idle: 'player.state.preparing',
  preparing: 'player.state.preparing',
  buffering: 'player.state.buffering',
  playing: null,
  // O ícone de play/pause no chrome já comunica o estado — sem texto extra.
  paused: null,
  // Tratado antes de chegar a renderizar (fecha a camada) — feature 011 Fase 5.
  completed: null,
  error: null,
  closed: null,
}

/** Guia Samsung 06 §1: oculta após 5s sem interação, salto de 10s. */
export const HIDE_CONTROLS_MS = 5000
export const JUMP_MS = 10_000

export const DEFAULT_UNAVAILABLE_KEY: MessageKey = 'player.msg.unavailable'
export const DEFAULT_GENERIC_ERROR_KEY: MessageKey = 'player.msg.generic'

/** Feature 042 (`logic/rede-e-lifecycle.md` §3/§4). */
export const RESUME_BLOCKED_KEY: MessageKey = 'player.msg.resumeBlocked'
export const RESUME_WAIT_KEY: MessageKey = 'player.msg.resumeWait'

export const GUIDE_UNAVAILABLE_KEY: MessageKey = 'player.msg.guideUnavailable'
export const TRACKS_UNAVAILABLE_KEY: MessageKey = 'player.msg.tracksUnavailable'
export const TRACK_SWITCH_FAILED_KEY = {
  audio: 'player.msg.audioSwitchFailed',
  text: 'player.msg.textSwitchFailed',
} as const satisfies Record<'audio' | 'text', MessageKey>

export const INFO_UNAVAILABLE_KEY: MessageKey = 'player.msg.infoUnavailable'

/** Feature 041 (`logic/aspecto-qualidade.md` §1.4/§2.4/§2.5). */
export const ASPECT_UNAVAILABLE_KEY: MessageKey = 'player.msg.aspectUnavailable'
export const QUALITY_UNAVAILABLE_KEY: MessageKey = 'player.msg.qualityUnavailable'
export const QUALITY_SINGLE_KEY: MessageKey = 'player.msg.qualitySingle'
export const ASPECT_SWITCH_FAILED_KEY: MessageKey = 'player.msg.aspectSwitchFailed'
export const QUALITY_SWITCH_FAILED_KEY: MessageKey = 'player.msg.qualitySwitchFailed'

export const LIMIT_MESSAGE_KEY = {
  channel: { previous: 'player.msg.firstChannel', next: 'player.msg.lastChannel' },
  episode: { previous: 'player.msg.firstEpisode', next: 'player.msg.lastEpisode' },
} as const satisfies Record<'channel' | 'episode', Record<'previous' | 'next', MessageKey>>

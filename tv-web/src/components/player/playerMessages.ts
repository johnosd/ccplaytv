import type { PlayerState } from '../../lib/player/PlayerService'

export const STATE_LABEL: Record<PlayerState, string> = {
  idle: 'Preparando…',
  preparing: 'Preparando…',
  buffering: 'Carregando…',
  playing: '',
  // O ícone de play/pause no chrome já comunica o estado — sem texto extra.
  paused: '',
  // Tratado antes de chegar a renderizar (fecha a camada) — feature 011 Fase 5.
  completed: '',
  error: '',
  closed: '',
}

/** Guia Samsung 06 §1: oculta após 5s sem interação, salto de 10s. */
export const HIDE_CONTROLS_MS = 5000
export const JUMP_MS = 10_000

export const DEFAULT_UNAVAILABLE_MESSAGE = 'Este item não tem uma fonte de reprodução disponível.'
export const DEFAULT_GENERIC_ERROR_MESSAGE = 'Não foi possível reproduzir isto.'

export const GUIDE_UNAVAILABLE_MESSAGE = 'O guia não está disponível neste player.'
export const TRACKS_UNAVAILABLE_MESSAGE = 'Este aparelho não informou as faixas deste conteúdo.'
export const TRACK_SWITCH_FAILED = {
  audio: 'Não foi possível trocar o áudio.',
  text: 'Não foi possível trocar a legenda.',
} as const

export const INFO_UNAVAILABLE_MESSAGE = 'Este aparelho não informou dados técnicos deste stream.'

export const LIMIT_MESSAGE = {
  channel: { previous: 'Este é o primeiro canal desta lista.', next: 'Este é o último canal desta lista.' },
  episode: { previous: 'Este é o primeiro episódio disponível.', next: 'Este é o último episódio disponível.' },
} as const

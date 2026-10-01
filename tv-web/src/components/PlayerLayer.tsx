import { useRef, useState } from 'react'
import type { PlayerServiceSession, QualityOption } from '../lib/player/PlayerService'
import { readPlayerPreferences } from '../lib/player/playerPreferences'
import { useToast } from '../lib/useToast'
import { Toast } from './Toast'
import { PlayerChrome } from './PlayerChrome'
import { PlayerChoicePanel } from './PlayerChoicePanel'
import { PlayerInfoPanel } from './PlayerInfoPanel'
import { PlayerTracksPanel } from './PlayerTracksPanel'
import { SubtitleOverlay } from './SubtitleOverlay'
import { buildTracksPanel } from './playerPanels'
import type { PlayerEpisodeStep, PlayerIdentity } from './chromeControls'
import { DEFAULT_GENERIC_ERROR_MESSAGE, DEFAULT_UNAVAILABLE_MESSAGE, STATE_LABEL } from './player/playerMessages'
import type { PanelState, PlayerLayerProps, PlayerLayerTopLayer } from './player/playerLayerTypes'
import { usePlayerChrome } from './player/usePlayerChrome'
import { usePanelRefresh, usePlayerPanels } from './player/usePlayerPanels'
import { usePlayerSession, useRescheduleOnState, useScreenSaverWhilePlaying, useVideoPlane } from './player/usePlayerSession'
import { usePlayerKeyboard } from './player/usePlayerKeyboard'

export type { PlayerIdentity, PlayerEpisodeStep, PlayerLayerProps, PlayerLayerTopLayer }

/**
 * Camada de reprodução em tela cheia — compartilhada entre Live TV, Filmes e
 * Séries (feature 011; antes vivia só em `features/live/PlayerOverlay.tsx`).
 *
 * É uma **camada**, não uma tela do roteador, de propósito: a tela de baixo
 * continua montada, então o foco e a posição sobrevivem sem precisar
 * carregar estado de foco no histórico de navegação do `App` (plano da spec
 * 003, D-005).
 *
 * Desde a feature 040 este arquivo só COMPÕE (`sdd/specs/040-dividir-player-
 * live/logic/divisao.md`): chrome (`player/usePlayerChrome`), painéis
 * (`player/usePlayerPanels`), sessão e ciclo de vida (`player/
 * usePlayerSession`) e teclado (`player/usePlayerKeyboard`). Os refs
 * compartilhados nascem aqui e são passados como objetos ref, e os hooks são
 * chamados na ordem em que os efeitos sempre rodaram: toast → pré-carga →
 * sessão → plano de hardware → reagendar → proteção de tela → releitura do
 * painel → teclado.
 */
export function PlayerLayer({
  itemId,
  title,
  onClose,
  createAdapter,
  startAtMs,
  unavailableMessage = DEFAULT_UNAVAILABLE_MESSAGE,
  genericErrorMessage = DEFAULT_GENERIC_ERROR_MESSAGE,
  onCompleted,
  topLayer,
  onIdleSelect,
  onEnteredPlaying,
  onSessionError,
  identity,
  onChannelStep,
  onGuide,
  episodeStep,
  initialTrackChoice,
  onTrackChoiceChange,
  initialViewChoice,
  onViewChoiceChange,
}: PlayerLayerProps) {
  const [errorFocus, setErrorFocus] = useState<0 | 1>(0)
  const sessionRef = useRef<PlayerServiceSession | null>(null)
  const panelRef = useRef<PanelState | null>(null)
  const qualityOptionsRef = useRef<QualityOption[]>([])
  // Preferências do aparelho: lidas UMA vez por montagem (feature 041, FR-012);
  // mudar uma com o player aberto não afeta a sequência em andamento.
  const [preferences] = useState(() => readPlayerPreferences())
  const { toastMessage, toastKey, showToast } = useToast()

  const chrome = usePlayerChrome({ sessionRef, panelRef, qualityOptionsRef, episodeStep, onGuide })
  const panels = usePlayerPanels({
    sessionRef,
    panelRef,
    chrome,
    showToast,
    preferences,
    qualityOptionsRef,
    initialTrackChoice,
    onTrackChoiceChange,
    initialViewChoice,
    onViewChoiceChange,
  })
  const { phase, hardwarePlane, retry } = usePlayerSession({
    itemId,
    createAdapter,
    startAtMs,
    unavailableMessage,
    genericErrorMessage,
    onClose,
    onCompleted,
    onEnteredPlaying,
    onSessionError,
    sessionRef,
    panelRef,
    chrome,
    reapplyTrackChoice: panels.reapplyTrackChoice,
    reapplyViewChoice: panels.reapplyViewChoice,
  })

  const isErrorScreen = phase.kind === 'error'
  const errorMessage = phase.kind === 'error' ? phase.message : ''
  const canRetry = phase.kind === 'error' ? phase.retryable : false

  const showsVideo =
    hardwarePlane &&
    phase.kind === 'session' &&
    (phase.state === 'buffering' || phase.state === 'playing' || phase.state === 'paused')
  useVideoPlane(showsVideo)

  const sessionState = phase.kind === 'session' ? phase.state : null
  useRescheduleOnState(sessionState, chrome.scheduleHide)
  useScreenSaverWhilePlaying(sessionState === 'playing')
  usePanelRefresh(panelRef.current?.kind ?? null, panels.refreshPanel)

  usePlayerKeyboard({
    topLayer,
    isErrorScreen,
    canRetry,
    errorFocus,
    setErrorFocus,
    retry,
    sessionRef,
    panelRef,
    chrome,
    panels,
    showToast,
    onClose,
    onIdleSelect,
    onChannelStep,
    onGuide,
    episodeStep,
  })

  const label = phase.kind === 'resolving' ? 'Preparando…' : (phase.kind === 'session' ? STATE_LABEL[phase.state] : '')
  const session = sessionRef.current
  const paused = phase.kind === 'session' && phase.state === 'paused'
  const chromeMedia = chrome.chromeMediaRef.current
  const chromeLevel = chrome.chromeLevelRef.current
  const panel = panelRef.current
  // O painel aberto substitui o chrome (feature 029); ao fechar, ele volta com o foco de origem.
  const chromeVisible =
    !topLayer && !isErrorScreen && session !== null && phase.kind === 'session' && chromeLevel !== 'hidden' && panel === null
  const tracksModel = panel?.kind === 'tracks' ? buildTracksPanel(panels.panelTracksRef.current, panels.choiceRef.current) : null

  return (
    <div className="player-overlay" role="dialog" aria-label={isErrorScreen ? 'Erro de reprodução' : `Reproduzindo ${title}`}>
      {/* O adaptador de desenvolvimento monta o <video> aqui. O AVPlay não usa
          este nó: ele desenha num plano de hardware atrás da camada web. */}
      <div id="player-surface" className="player-surface" />
      {isErrorScreen ? (
        <div className="player-message">
          <div className="player-message-title">{title}</div>
          {/* Mensagem sanitizada: nunca inclui URL, endereço de provedor ou
              credencial (FR-011). */}
          <div className="player-message-copy">{errorMessage}</div>
          <div className="player-actions">
            {canRetry && (
              <button
                type="button"
                className={`player-action${errorFocus === 0 ? ' tv-focus' : ''}`}
              >
                Tentar de novo
              </button>
            )}
            <button
              type="button"
              className={`player-action${!canRetry || errorFocus === 1 ? ' tv-focus' : ''}`}
            >
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <>
          {label !== '' && (
            <div className="player-status">
              <div className="player-status-channel">{title}</div>
              <div className="player-status-label">{label}</div>
            </div>
          )}
          {chromeVisible && session && (
            <PlayerChrome
              media={chromeMedia}
              identity={identity ?? { title }}
              paused={paused}
              controls={
                chromeMedia === 'live'
                  ? chromeLevel === 'full'
                    ? chrome.controlsFor(session.capabilities, false)
                    : []
                  : chrome.controlsFor(session.capabilities, paused)
              }
              focusedIndex={chromeLevel === 'full' && !chrome.seekBarFocusedRef.current ? chrome.focusedIndexRef.current : null}
              capabilities={session.capabilities}
              progress={session.progress}
              seekBarFocused={chromeMedia === 'vod' && chrome.seekBarFocusedRef.current}
            />
          )}
          {/* Legenda embutida desenhada pelo app (feature 029, D-004): não
              aparece sob o zapping (FR-008) nem na tela de erro. */}
          {session && phase.kind === 'session' && !topLayer && (
            <SubtitleOverlay
              session={session}
              delayMs={panels.choiceRef.current.subtitleDelayMs}
              paused={paused}
              raised={chromeVisible}
            />
          )}
          {panel?.kind === 'tracks' && tracksModel && <PlayerTracksPanel model={tracksModel} focusedKey={panel.focusKey} />}
          {(panel?.kind === 'aspect' || panel?.kind === 'quality') && session && (
            <PlayerChoicePanel model={panels.choiceModelFor(session, panel.kind)} focusedKey={panel.focusKey} />
          )}
          {panel?.kind === 'info' && (
            <PlayerInfoPanel
              info={panels.panelInfoRef.current.info}
              activeAudioLabel={panels.panelInfoRef.current.activeAudioLabel}
            />
          )}
        </>
      )}
      <Toast message={toastMessage} messageKey={toastKey} />
      {topLayer && (
        <div className="player-zap-scrim">{topLayer.content}</div>
      )}
    </div>
  )
}

import { useRef, useState } from 'react'
import type { PlayerServiceSession, QualityOption } from '../lib/player/PlayerService'
import { readPlayerPreferences } from '../lib/player/playerPreferences'
import { useToast } from '../lib/useToast'
import { Toast } from './Toast'
import { PlayerChrome } from './PlayerChrome'
import { PlayerChoicePanel } from './PlayerChoicePanel'
import { PlayerErrorInfoPanel } from './PlayerErrorInfoPanel'
import { PlayerInfoPanel } from './PlayerInfoPanel'
import { PlayerTracksPanel } from './PlayerTracksPanel'
import { SubtitleOverlay } from './SubtitleOverlay'
import { buildTracksPanel } from './playerPanels'
import type { PlayerEpisodeStep, PlayerIdentity } from './chromeControls'
import {
  DEFAULT_GENERIC_ERROR_MESSAGE,
  DEFAULT_UNAVAILABLE_MESSAGE,
  RECONNECTING_LABEL,
  RESUME_BLOCKED_MESSAGE,
  STATE_LABEL,
  VERIFYING_NETWORK_LABEL,
} from './player/playerMessages'
import type { PanelState, PlayerLayerProps, PlayerLayerTopLayer } from './player/playerLayerTypes'
import { usePlayerChrome } from './player/usePlayerChrome'
import { usePanelRefresh, usePlayerPanels } from './player/usePlayerPanels'
import { usePlayerSession, useRescheduleOnState, useScreenSaverWhilePlaying, useVideoPlane } from './player/usePlayerSession'
import { usePlayerKeyboard } from './player/usePlayerKeyboard'
import { buildErrorActions, ERROR_ACTION_LABEL, type ErrorActionId } from './player/playerErrorActions'

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
  onEditSource,
}: PlayerLayerProps) {
  const [errorFocus, setErrorFocus] = useState(0)
  const [errorInfoOpen, setErrorInfoOpen] = useState(false)
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
  const { phase, hardwarePlane, retry, resumeGate, resumeGateRef, recheckResume, sourceIdRef } = usePlayerSession({
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
  const errorDiagnosis = phase.kind === 'error' ? phase.diagnosis : undefined
  const errorActions: ErrorActionId[] = isErrorScreen
    ? buildErrorActions({
        retryable: phase.retryable,
        diagnosis: errorDiagnosis,
        canEditSource: onEditSource !== undefined,
      })
    : []

  function handleErrorAction(action: ErrorActionId) {
    if (action === 'retry') {
      setErrorFocus(0)
      setErrorInfoOpen(false)
      retry()
    } else if (action === 'info') {
      setErrorInfoOpen(true)
    } else if (action === 'edit') {
      const sourceId = sourceIdRef.current
      if (sourceId !== null) onEditSource?.(sourceId)
    } else {
      onClose()
    }
  }

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
    errorActions,
    errorFocus,
    setErrorFocus,
    errorInfoOpen,
    closeErrorInfo: () => setErrorInfoOpen(false),
    onErrorAction: handleErrorAction,
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
    resumeGateRef,
    recheckResume,
  })

  const label =
    phase.kind === 'resolving'
      ? 'Preparando…'
      : phase.kind === 'reconnecting'
        ? RECONNECTING_LABEL(phase.attempt, phase.max)
        : phase.kind === 'session'
          ? resumeGate === 'verifying'
            ? VERIFYING_NETWORK_LABEL
            : STATE_LABEL[phase.state]
          : ''
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
    <div
      className="player-overlay"
      role="dialog"
      aria-label={
        isErrorScreen
          ? `Erro de reprodução${errorDiagnosis ? `, código ${errorDiagnosis.code}` : ''}`
          : `Reproduzindo ${title}`
      }
    >
      {/* O adaptador de desenvolvimento monta o <video> aqui. O AVPlay não usa
          este nó: ele desenha num plano de hardware atrás da camada web. */}
      <div id="player-surface" className="player-surface" />
      {isErrorScreen ? (
        <div className="player-message">
          <div className="player-message-title">{title}</div>
          {/* Mensagem sanitizada: nunca inclui URL, endereço de provedor ou
              credencial (FR-011). */}
          <div className="player-message-copy">{errorMessage}</div>
          {errorDiagnosis && (
            <span data-testid="player-error-code" className="player-error-code">
              {errorDiagnosis.code}
            </span>
          )}
          <div className="player-actions">
            {errorActions.map((action, index) => (
              <button
                key={action}
                type="button"
                className={`player-action${errorFocus === index && !errorInfoOpen ? ' tv-focus' : ''}`}
                onClick={() => handleErrorAction(action)}
              >
                {ERROR_ACTION_LABEL[action]}
              </button>
            ))}
          </div>
          {errorInfoOpen && errorDiagnosis && <PlayerErrorInfoPanel info={errorDiagnosis.technical} />}
        </div>
      ) : (
        <>
          {label !== '' && (
            <div className="player-status" role="status">
              <div className="player-status-channel">{title}</div>
              <div className="player-status-label">{label}</div>
            </div>
          )}
          {/* Retomada sem rede (feature 042, D-006): o filme segue pausado na mesma
              posição; OK (ou clique) repete a verificação. Foco por estado. */}
          {resumeGate === 'blocked' && (
            <div className="player-gate" role="status">
              <div className="player-message-copy">{RESUME_BLOCKED_MESSAGE}</div>
              <div className="player-actions">
                <button type="button" className="player-action tv-focus" onClick={recheckResume}>
                  Tentar de novo
                </button>
              </div>
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

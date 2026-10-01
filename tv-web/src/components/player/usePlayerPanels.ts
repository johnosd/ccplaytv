import { useEffect, useRef, type RefObject } from 'react'
import type { PlayerServiceSession, TrackChoice } from '../../lib/player/PlayerService'
import { DEFAULT_TRACK_CHOICE, normalizeLanguage, pickTracksForChoice, trackLabels, type MediaTrack } from '../../lib/player/tracks'
import type { ChromeControl } from '../chromeControls'
import { buildTracksPanel, initialTracksFocusKey, moveTracksFocus, reconcileTracksFocus } from '../playerPanels'
import { INFO_UNAVAILABLE_MESSAGE, TRACK_SWITCH_FAILED, TRACKS_UNAVAILABLE_MESSAGE } from './playerMessages'
import type { InfoSnapshot, PanelState } from './playerLayerTypes'
import type { PlayerChrome } from './usePlayerChrome'

export interface PlayerPanelsParams {
  sessionRef: RefObject<PlayerServiceSession | null>
  panelRef: RefObject<PanelState | null>
  chrome: PlayerChrome
  showToast: (message: string) => void
  initialTrackChoice: TrackChoice | null | undefined
  onTrackChoiceChange: ((choice: TrackChoice) => void) | undefined
}

export interface PlayerPanels {
  panelTracksRef: RefObject<MediaTrack[]>
  panelInfoRef: RefObject<InfoSnapshot>
  choiceRef: RefObject<TrackChoice>
  reapplyTrackChoice: (session: PlayerServiceSession) => void
  refreshPanel: () => void
  closePanel: () => void
  activatePanelControl: (control: ChromeControl, session: PlayerServiceSession) => boolean
  handlePanelDirection: (direction: 'up' | 'down' | 'left' | 'right') => void
  handlePanelSelect: () => void
}

/**
 * Painéis de áudio/legendas e info do stream (feature 029). Extraído do
 * `PlayerLayer` na feature 040 sem mudar nada. O intervalo de releitura é
 * um hook à parte (`usePanelRefresh`), chamado pelo `PlayerLayer` na mesma
 * posição de antes entre os efeitos (`logic/divisao.md` §1.2).
 */
export function usePlayerPanels({
  sessionRef,
  panelRef,
  chrome,
  showToast,
  initialTrackChoice,
  onTrackChoiceChange,
}: PlayerPanelsParams): PlayerPanels {
  const { clearHideTimer, focusedIndexRef, rerender, scheduleHide, seekBarFocusedRef, setFocused, setLevel } = chrome

  /**
   * Painel de faixas aberto (feature 029) — em ref pelo mesmo motivo do chrome
   * (uma tecla chega entre a mutação e o commit). `panelTracksRef` é a
   * última leitura do motor; `choiceRef` a escolha da pessoa (áudio, legenda,
   * atraso), semeada só na montagem — trocas de `itemId` na mesma montagem a
   * herdam, e quem desmonta a camada entre dois itens a passa por
   * `initialTrackChoice`.
   */
  const panelTracksRef = useRef<MediaTrack[]>([])
  const panelInfoRef = useRef<InfoSnapshot>({ info: null, activeAudioLabel: undefined })
  const choiceRef = useRef<TrackChoice>(initialTrackChoice ?? DEFAULT_TRACK_CHOICE)

  /**
   * Reaplica, por IDIOMA, a escolha da sequência (FR-021/FR-022) — ids e
   * códigos de faixa mudam de uma sessão para outra. Síncrona, no mesmo
   * `publish()` da primeira entrada em `playing`. Silenciosa na falha, sem
   * aviso (FR-022), e nunca conta como escolha da pessoa. Legenda só é
   * mexida quando há idioma a ligar: a sessão já nasce desativada (D-005).
   */
  function reapplyTrackChoice(session: PlayerServiceSession) {
    if (!session.supportsTracks) return
    const tracks = session.getTracks()
    if (!tracks) return
    const { audioId, textId } = pickTracksForChoice(tracks, choiceRef.current)
    const audioAlreadyActive = tracks.some((t) => t.kind === 'audio' && t.id === audioId && t.active)
    if (audioId !== undefined && !audioAlreadyActive) session.selectAudioTrack(audioId)
    if (textId !== null) session.selectTextTrack(textId)
  }

  /** Grava uma escolha da pessoa (nunca a reaplicação automática) e avisa quem guarda entre itens. */
  function commitChoice(patch: Partial<TrackChoice>) {
    choiceRef.current = { ...choiceRef.current, ...patch }
    onTrackChoiceChange?.(choiceRef.current)
  }

  /** Lê do motor o que o painel de info mostra: dados técnicos + rótulo do áudio ativo. */
  function readInfoSnapshot(session: PlayerServiceSession): InfoSnapshot {
    const tracks = session.getTracks() ?? []
    const labels = trackLabels(tracks)
    const activeIndex = tracks.findIndex((t) => t.kind === 'audio' && t.active)
    return { info: session.getStreamInfo(), activeAudioLabel: activeIndex === -1 ? undefined : labels[activeIndex] }
  }

  /** Relê o painel aberto (FR-012/FR-016): mantém o foco pela chave, nunca pelo índice. */
  function refreshPanel() {
    const session = sessionRef.current
    const panel = panelRef.current
    if (!session || !panel) return
    if (panel.kind === 'info') {
      panelInfoRef.current = readInfoSnapshot(session)
    } else {
      const tracks = session.getTracks()
      if (tracks) panelTracksRef.current = tracks
      const model = buildTracksPanel(panelTracksRef.current, choiceRef.current)
      panelRef.current = { ...panel, focusKey: reconcileTracksFocus(model, panel.focusKey) }
    }
    rerender()
  }

  function openInfoPanel(session: PlayerServiceSession) {
    panelInfoRef.current = readInfoSnapshot(session)
    clearHideTimer()
    panelRef.current = { kind: 'info', originIndex: focusedIndexRef.current }
    rerender()
  }

  function openTracksPanel(session: PlayerServiceSession) {
    const tracks = session.getTracks()
    if (!tracks || tracks.length === 0) {
      showToast(TRACKS_UNAVAILABLE_MESSAGE)
      scheduleHide()
      return
    }
    panelTracksRef.current = tracks
    const model = buildTracksPanel(tracks, choiceRef.current)
    clearHideTimer()
    panelRef.current = { kind: 'tracks', focusKey: initialTracksFocusKey(model), originIndex: focusedIndexRef.current }
    rerender()
  }

  /** Fecha o painel e devolve o foco ao botão que o abriu (FR-010) — no Live, à linha, não à faixa. */
  function closePanel() {
    const panel = panelRef.current
    if (!panel) return
    panelRef.current = null
    seekBarFocusedRef.current = false
    setLevel('full')
    setFocused(panel.originIndex)
    scheduleHide()
  }

  /**
   * SELECT num botão do chrome que abre painel (ou explica por que não abre).
   * Devolve `true` quando o controle é dele — quem chama não faz mais nada.
   */
  function activatePanelControl(control: ChromeControl, session: PlayerServiceSession): boolean {
    if (control.id !== 'tracks' && control.id !== 'info') return false
    if (control.availability === 'real') {
      if (control.id === 'tracks') openTracksPanel(session)
      else openInfoPanel(session)
    } else {
      showToast(control.id === 'tracks' ? TRACKS_UNAVAILABLE_MESSAGE : INFO_UNAVAILABLE_MESSAGE)
      scheduleHide()
    }
    return true
  }

  function handlePanelDirection(direction: 'up' | 'down' | 'left' | 'right') {
    const panel = panelRef.current
    // Info só tem "Fechar": setas não movem nada. Em tracks, ←/→ também não.
    if (!panel || panel.kind !== 'tracks' || direction === 'left' || direction === 'right') return
    const model = buildTracksPanel(panelTracksRef.current, choiceRef.current)
    panelRef.current = { ...panel, focusKey: moveTracksFocus(model, panel.focusKey, direction) }
    rerender()
  }

  function handlePanelSelect() {
    const session = sessionRef.current
    const panel = panelRef.current
    if (!session || !panel) return
    // Info: o único focável é "Fechar".
    if (panel.kind === 'info') {
      closePanel()
      return
    }
    const model = buildTracksPanel(panelTracksRef.current, choiceRef.current)
    const row = model.rows.find((r) => r.key === panel.focusKey)
    if (!row) return
    if (row.disabled) {
      if (row.disabledMessage) showToast(row.disabledMessage)
      return
    }
    const track = panelTracksRef.current.find((t) => t.id === row.trackId)
    if (row.group === 'audio' || row.group === 'ad') {
      if (row.trackId === undefined || !session.selectAudioTrack(row.trackId)) {
        showToast(TRACK_SWITCH_FAILED.audio)
      } else if (row.group === 'audio') {
        // Áudio-descrição é um modo, não um idioma: não redefine a preferência.
        commitChoice({ audioLanguage: normalizeLanguage(track?.language) ?? null })
      }
    } else if (row.group === 'text') {
      if (!session.selectTextTrack(row.trackId ?? null)) {
        showToast(TRACK_SWITCH_FAILED.text)
      } else {
        commitChoice({ textLanguage: normalizeLanguage(track?.language) ?? null })
      }
    } else if (row.delayMs !== undefined) {
      commitChoice({ subtitleDelayMs: row.delayMs })
    }
    // A marcação reflete o que o motor realmente fez (FR-009), inclusive na falha.
    refreshPanel()
  }

  return {
    panelTracksRef,
    panelInfoRef,
    choiceRef,
    reapplyTrackChoice,
    refreshPanel,
    closePanel,
    activatePanelControl,
    handlePanelDirection,
    handlePanelSelect,
  }
}

/**
 * Releitura de 1 s só com painel aberto (feature 029, D-009): faixas mudam
 * (Live troca de programa, stream adaptativo reanuncia) e a marcação precisa
 * acompanhar. Pula com o app oculto e para ao fechar o painel.
 */
export function usePanelRefresh(panelKind: PanelState['kind'] | null, refreshPanel: () => void): void {
  useEffect(() => {
    if (panelKind === null) return
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      refreshPanel()
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshPanel só lê refs estáveis; o intervalo depende apenas de haver painel aberto
  }, [panelKind])
}

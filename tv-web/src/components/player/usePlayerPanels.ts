import { useEffect, useRef, type RefObject } from 'react'
import type { PlayerServiceSession, QualityOption, TrackChoice, ViewChoice } from '../../lib/player/PlayerService'
import { trackChoiceFromPreferences, viewChoiceFromPreferences, type PlayerPreferences } from '../../lib/player/playerPreferences'
import { normalizeLanguage, pickTracksForChoice, trackLabels, type MediaTrack } from '../../lib/player/tracks'
import { distinctQualities, pickAspectForChoice, pickQualityForChoice } from '../../lib/player/viewChoice'
import type { ChromeControl } from '../chromeControls'
import { buildTracksPanel, initialTracksFocusKey, moveTracksFocus, reconcileTracksFocus } from '../playerPanels'
import {
  buildAspectPanel,
  buildQualityPanel,
  initialChoiceFocusKey,
  moveChoiceFocus,
  reconcileChoiceFocus,
  type ChoicePanelModel,
} from '../playerViewPanels'
import {
  ASPECT_SWITCH_FAILED,
  ASPECT_UNAVAILABLE_MESSAGE,
  INFO_UNAVAILABLE_MESSAGE,
  QUALITY_SINGLE_MESSAGE,
  QUALITY_SWITCH_FAILED,
  QUALITY_UNAVAILABLE_MESSAGE,
  TRACK_SWITCH_FAILED,
  TRACKS_UNAVAILABLE_MESSAGE,
} from './playerMessages'
import type { InfoSnapshot, PanelState } from './playerLayerTypes'
import type { PlayerChrome } from './usePlayerChrome'

export interface PlayerPanelsParams {
  sessionRef: RefObject<PlayerServiceSession | null>
  panelRef: RefObject<PanelState | null>
  chrome: PlayerChrome
  showToast: (message: string) => void
  /** Preferências do aparelho, lidas UMA vez por montagem pelo `PlayerLayer` (feature 041, FR-012). */
  preferences: PlayerPreferences
  qualityOptionsRef: RefObject<QualityOption[]>
  initialTrackChoice: TrackChoice | null | undefined
  onTrackChoiceChange: ((choice: TrackChoice) => void) | undefined
  initialViewChoice: ViewChoice | null | undefined
  onViewChoiceChange: ((choice: ViewChoice) => void) | undefined
}

export interface PlayerPanels {
  panelTracksRef: RefObject<MediaTrack[]>
  panelInfoRef: RefObject<InfoSnapshot>
  choiceRef: RefObject<TrackChoice>
  reapplyTrackChoice: (session: PlayerServiceSession) => void
  reapplyViewChoice: (session: PlayerServiceSession) => void
  /** Modelo do painel de aspecto/qualidade (lê o estado da sessão agora). */
  choiceModelFor: (session: PlayerServiceSession, kind: 'aspect' | 'quality') => ChoicePanelModel
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
  preferences,
  qualityOptionsRef,
  initialTrackChoice,
  onTrackChoiceChange,
  initialViewChoice,
  onViewChoiceChange,
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
  // Sem escolha herdada, a reprodução NOVA parte das preferências do aparelho
  // (feature 041, FR-012). O player nunca as grava de volta (D-005).
  const choiceRef = useRef<TrackChoice>(initialTrackChoice ?? trackChoiceFromPreferences(preferences))
  const viewChoiceRef = useRef<ViewChoice>(initialViewChoice ?? viewChoiceFromPreferences(preferences))

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

  /** Relê as qualidades do motor para o ref que o chrome e os painéis usam (pontos discretos, `logic` §2.4). */
  function refreshQualityOptions(session: PlayerServiceSession): QualityOption[] {
    const raw = session.supportsQuality ? session.getQualities() : null
    qualityOptionsRef.current = raw ? distinctQualities(raw) : []
    return raw ?? []
  }

  /**
   * Reaplica aspecto e qualidade da sequência (feature 041, D-004) logo depois
   * das faixas, na primeira entrada em `playing`. Aspecto: SEMPRE, inclusive
   * `fit` — o AVPlay é um singleton e o modo pode sobreviver a `close()`.
   * Qualidade: só quando a regra escolhe uma variante (`null` não chama o
   * motor). Silenciosa na falha e nunca conta como escolha da pessoa.
   */
  function reapplyViewChoice(session: PlayerServiceSession) {
    const aspect = pickAspectForChoice(session.aspectModes, viewChoiceRef.current.aspect)
    if (aspect !== null) session.setAspectMode(aspect)
    const raw = refreshQualityOptions(session)
    const id = pickQualityForChoice(raw, viewChoiceRef.current.quality)
    if (id !== null) session.selectQuality(id)
  }

  /** Grava uma escolha de aspecto/qualidade da pessoa (nunca a reaplicação) e avisa quem guarda entre itens. */
  function commitView(patch: Partial<ViewChoice>) {
    viewChoiceRef.current = { ...viewChoiceRef.current, ...patch }
    onViewChoiceChange?.(viewChoiceRef.current)
  }

  function choiceModelFor(session: PlayerServiceSession, kind: 'aspect' | 'quality'): ChoicePanelModel {
    if (kind === 'aspect') {
      return buildAspectPanel(session.aspectModes, session.currentAspect ?? pickAspectForChoice(session.aspectModes, 'fit'))
    }
    return buildQualityPanel(qualityOptionsRef.current, session.selectedQualityId)
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
    } else if (panel.kind === 'aspect' || panel.kind === 'quality') {
      if (panel.kind === 'quality') {
        refreshQualityOptions(session)
        // A variante escolhida sumiu do stream: cai para Auto, sem contar como escolha da pessoa.
        const selected = session.selectedQualityId
        if (selected !== null && !qualityOptionsRef.current.some((o) => o.id === selected)) session.selectQuality(null)
      }
      const model = choiceModelFor(session, panel.kind)
      panelRef.current = { ...panel, focusKey: reconcileChoiceFocus(model, panel.focusKey) }
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

  function openChoicePanel(session: PlayerServiceSession, kind: 'aspect' | 'quality') {
    const model = choiceModelFor(session, kind)
    clearHideTimer()
    panelRef.current = { kind, focusKey: initialChoiceFocusKey(model), originIndex: focusedIndexRef.current }
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
    if (control.id === 'aspect') {
      if (control.availability === 'real') openChoicePanel(session, 'aspect')
      else {
        showToast(ASPECT_UNAVAILABLE_MESSAGE)
        scheduleHide()
      }
      return true
    }
    if (control.id === 'quality') {
      // Decide com a leitura de agora, não com a do último render (`logic` §2.4).
      refreshQualityOptions(session)
      const count = qualityOptionsRef.current.length
      if (session.supportsQuality && count >= 2) openChoicePanel(session, 'quality')
      else {
        showToast(session.supportsQuality && count === 1 ? QUALITY_SINGLE_MESSAGE : QUALITY_UNAVAILABLE_MESSAGE)
        scheduleHide()
      }
      return true
    }
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
    if (!panel || panel.kind === 'info' || direction === 'left' || direction === 'right') return
    if (panel.kind === 'aspect' || panel.kind === 'quality') {
      const session = sessionRef.current
      if (!session) return
      const choiceModel = choiceModelFor(session, panel.kind)
      panelRef.current = { ...panel, focusKey: moveChoiceFocus(choiceModel, panel.focusKey, direction) }
      rerender()
      return
    }
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
    if (panel.kind === 'aspect' || panel.kind === 'quality') {
      const choiceRow = choiceModelFor(session, panel.kind).rows.find((r) => r.key === panel.focusKey)
      if (!choiceRow) return
      if (panel.kind === 'aspect' && choiceRow.mode !== undefined) {
        if (session.setAspectMode(choiceRow.mode)) commitView({ aspect: choiceRow.mode })
        else showToast(ASPECT_SWITCH_FAILED)
      } else if (panel.kind === 'quality' && choiceRow.qualityId !== undefined) {
        if (session.selectQuality(choiceRow.qualityId)) {
          commitView({
            quality: choiceRow.qualityId === null || choiceRow.height === undefined ? 'auto' : { height: choiceRow.height },
          })
        } else {
          showToast(QUALITY_SWITCH_FAILED)
        }
      }
      // A marcação reflete o que o motor realmente fez, inclusive na falha.
      refreshPanel()
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
    reapplyViewChoice,
    choiceModelFor,
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
